import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stringaPagamento, verificaIban } from '@/lib/iban'
import { cosaManca, metodoValido } from '@/lib/metodo-pagamento'
import { inviaRichiestaPagamento } from '@/lib/partner'
import { riconciliaDaPagamento, type EsitoRiconciliazione } from '@/lib/riconcilia'
import { utenteCorrente } from '@/lib/sessione'
import { chiaveFornitore } from '@/lib/richieste-fornitore'
import { sembraIlCliente } from '@/lib/riconciliazione'
import { avvisaPagamentoDaFare } from '@/lib/avviso-pagamento-da-fare'

export const dynamic = 'force-dynamic'

// Le richieste di pagamento salvate.
export async function GET() {
  // ⚠️⚠️ Si SCEGLIE cosa tornare, e i byte della ricevuta restano fuori.
  //
  // È il file in base64: senza questo `select`, ogni caricamento della pagina si
  // porterebbe dietro le ricevute di TUTTE le righe — duecento file da qualche
  // centinaio di KB l'uno — per mostrare una tabella che di quel file usa solo
  // il nome. Su un telefono in giro vuol dire una pagina che non arriva.
  const richieste = await db.richiestaPagamento.findMany({
    orderBy: { creatoIl: 'desc' },
    take: 200,
    select: {
      id: true,
      iban: true,
      bic: true,
      intestatario: true,
      importo: true,
      valuta: true,
      causale: true,
      note: true,
      contatto: true,
      linkConversazione: true,
      riferimento: true,
      inviataIl: true,
      partnerId: true,
      partnerStato: true,
      esitoInvio: true,
      ibanValido: true,
      ibanPaese: true,
      origine: true,
      ordineNumero: true,
      metodo: true,
      riferimentoPagamento: true,
      pagataIl: true,
      pagataDaNome: true,
      pagatoCon: true,
      avvisoIl: true,
      avvisoCanale: true,
      avvisoEsito: true,
      // Il NOME e il TIPO sì (servono a dire «ricevuta ✓» e ad aprirla), i byte no.
      ricevutaNome: true,
      ricevutaTipo: true,
      creatoIl: true,
    },
  })
  // ── QUANTO VALEVA L'ORDINE, per ogni riga ──
  //
  // ⚠️ Serve alla colonna «Margine»: senza il venduto, la percentuale non si può
  // calcolare — e una tabella di pagamenti che non dice quanto ci resta è
  // esattamente quella che fa scoprire un accordo sbagliato a fine mese.
  //
  // ⚠️ UNA query per tutte le righe, non una per riga: con duecento richieste
  // sarebbero duecento andate e ritorni al database a ogni caricamento.
  const numeri = [...new Set(richieste.map((r) => r.ordineNumero).filter(Boolean))]
  const ordini = numeri.length
    ? await db.ordine.findMany({
        where: { numero: { in: numeri } },
        select: { numero: true, totale: true, fornitoreNome: true, gestione: true },
      })
    : []
  // ⚠️ Se lo stesso numero esiste su più negozi si tiene il PIÙ ALTO invece di
  // uno a caso: sul valore più alto il margine risulta migliore di quello vero,
  // e un margine gonfiato si nota; uno sgonfiato manda a ridiscutere un prezzo
  // che era giusto. Nessuna delle due è buona, ma questa si accorge di sé.
  const valore = new Map<string, number>()
  const fornitore = new Map<string, string>()
  for (const o of ordini) {
    valore.set(o.numero, Math.max(valore.get(o.numero) ?? 0, o.totale ?? 0))
    if (o.fornitoreNome) fornitore.set(o.numero, o.fornitoreNome)
  }

  return NextResponse.json({
    richieste: richieste.map((r) => ({
      ...r,
      stringa: stringaPagamento(r),
      valoreOrdine: valore.get(r.ordineNumero) ?? 0,
      fornitoreOrdine: fornitore.get(r.ordineNumero) ?? '',
      // ⚠️ Più di un ordine con quel numero: lo si dice, e la colonna del
      // margine lo segnala invece di mostrare una percentuale che potrebbe
      // essere di un altro ordine.
      ordiniOmonimi: ordini.filter((o) => o.numero === r.ordineNumero).length,
    })),
  })
}

export async function POST(req: NextRequest) {
  // ⚠️ Serve per SCRIVERE CHI: registrando il fornitore sull'ordine si archivia
  // anche chi l'ha deciso, e «lo ha deciso l'app» non è una risposta utile
  // davanti a un fornitore che dice di non aver mai accettato quell'ordine.
  const io = await utenteCorrente()
  const c = (await req.json().catch(() => ({}))) as {
    iban?: string
    bic?: string
    intestatario?: string
    importo?: number
    valuta?: string
    causale?: string
    note?: string
    contatto?: string
    linkConversazione?: string
    origine?: string
    ordineNumero?: string
    /** iban · link · paypal · altro. Vedi src/lib/metodo-pagamento.ts. */
    metodo?: string
    riferimentoPagamento?: string
    // false = salva soltanto, senza mandarla a Partner
    inviaAPartner?: boolean
  }

  // ⚠️⚠️ NON TUTTI I FORNITORI SI PAGANO CON UN BONIFICO. Chi manda un link,
  // chi dà un PayPal, chi si accorda a voce. Finché qui si pretendeva un IBAN,
  // tutto il resto non si registrava affatto: restava in una chat, e
  // sull'ordine risultava che non avevamo pagato nessuno.
  const metodo = (c.metodo ?? 'iban').trim()
  if (!metodoValido(metodo)) {
    return NextResponse.json({ errore: 'Metodo di pagamento non valido.' }, { status: 400 })
  }
  const esitoIban = verificaIban(c.iban ?? '')
  const riferimento = (c.riferimentoPagamento ?? '').trim()
  const manca = cosaManca({
    metodo,
    iban: esitoIban.normalizzato,
    riferimento,
    intestatario: (c.intestatario ?? '').trim(),
    causale: (c.causale ?? '').trim(),
    ordineNumero: (c.ordineNumero ?? '').trim(),
  })
  if (manca) return NextResponse.json({ errore: manca }, { status: 400 })

  // ── PAGARE UNO PER UN ORDINE CHE NE HA UN ALTRO ──
  //
  // ⚠️⚠️ Questo si BLOCCA, e non è la stessa cosa che «l'ordine impara chi lo
  // prepara» (che succede più sotto, da solo). È il caso in cui i due nomi si
  // contraddicono: l'ordine dice che l'ha preparato Tizio, e la richiesta chiede
  // di pagare Caio. Uno dei due è sbagliato, e lasciando salvare si sceglie il
  // peggiore dei modi di scoprirlo — cioè mai: il bonifico parte, il margine
  // dell'ordine resta calcolato su un costo che non c'entra, e Tizio richiama
  // fra due settimane chiedendo perché non è stato pagato.
  //
  // ⚠️ NON si blocca un rimborso al cliente: quello ha per forza un nome diverso
  // da quello del fornitore, ed è legittimo. Vedi `sembraIlCliente`, che è lo
  // stesso controllo della riconciliazione.
  //
  // ⚠️ E non si blocca se l'ordine non ce l'abbiamo (più vecchio di 60 giorni):
  // lì non possiamo confrontare niente, e impedire di pagare un ordine vecchio
  // sarebbe un danno vero per proteggere da un sospetto che non abbiamo.
  const numeroChiesto = (c.ordineNumero ?? '').trim()
  const intestatarioChiesto = (c.intestatario ?? '').trim()
  if (numeroChiesto) {
    const senzaCancelletto = numeroChiesto.replace('#', '')
    const o = await db.ordine.findFirst({
      where: { numero: { in: [senzaCancelletto, `#${senzaCancelletto}`] } },
      select: { numero: true, clienteNome: true, fornitoreNome: true },
    })
    if (
      o &&
      o.fornitoreNome &&
      chiaveFornitore(o.fornitoreNome) !== chiaveFornitore(intestatarioChiesto) &&
      !sembraIlCliente(intestatarioChiesto, o.clienteNome)
    ) {
      return NextResponse.json(
        {
          errore:
            `${o.numero} risulta preparato da «${o.fornitoreNome}», ma stai chiedendo di pagare «${intestatarioChiesto}». ` +
            'Uno dei due è sbagliato: correggi il fornitore sull’ordine, oppure il nome qui.',
        },
        { status: 409 }
      )
    }
  }

  // Un IBAN che non supera il checksum si può salvare lo stesso (magari va
  // completato a mano), ma resta marcato come non valido: mai spacciarlo per buono.
  const richiesta = await db.richiestaPagamento.create({
    data: {
      metodo,
      // ⚠️ Si scrive solo il campo del metodo scelto: lasciare l'altro pieno
      // vorrebbe dire una riga che dice due cose diverse su come si paga.
      riferimentoPagamento: metodo === 'iban' ? '' : riferimento,
      iban: metodo === 'iban' ? esitoIban.normalizzato : '',
      bic: (c.bic ?? '').replace(/\s/g, '').toUpperCase(),
      intestatario: (c.intestatario ?? '').trim(),
      importo: Number(c.importo) || 0,
      valuta: (c.valuta || 'EUR').toUpperCase(),
      causale: (c.causale ?? '').trim(),
      note: (c.note ?? '').trim(),
      contatto: (c.contatto ?? '').trim(),
      linkConversazione: (c.linkConversazione ?? '').trim(),
      // ⚠️ Su un metodo che non è un bonifico `false` vuol dire «non
      // applicabile», non «sbagliato»: chi legge la tabella deve vedere «—»,
      // non un allarme rosso su una riga che sta benissimo.
      ibanValido: metodo === 'iban' ? esitoIban.valido : false,
      ibanPaese: metodo === 'iban' ? esitoIban.paese : '',
      origine: c.origine || 'manuale',
      ordineNumero: (c.ordineNumero ?? '').trim(),
    },
  })

  // ── L'ORDINE PASSA A «IN PAGAMENTO», DA SOLO ──
  //
  // ⚠️ Chiesto dall'utente, ed è giusto: chiedere il pagamento di un ordine È
  // il passo «in pagamento». Farlo spuntare a mano dopo vuol dire che metà
  // degli ordini resta indietro di un passo — e la bacheca, che si legge a
  // colpo d'occhio, mostra uno stato più vecchio del vero.
  //
  // ⚠️ Solo se l'ordine è ancora INDIETRO. Su uno già «attesa consegna» o
  // «gestito» riportarlo a «in pagamento» sarebbe tornare indietro nel tempo:
  // una richiesta si può salvare anche dopo aver pagato, e lo stato di
  // lavorazione non deve arretrare per questo.
  //
  // ⚠️ Un errore qui NON fa fallire il salvataggio: la richiesta è la cosa che
  // conta, lo stato è un contorno.
  if (richiesta.ordineNumero) {
    try {
      await db.ordine.updateMany({
        where: {
          numero: richiesta.ordineNumero,
          gestione: { in: ['da_gestire', 'ricerca_fornitore', 'comunicazione'] },
        },
        data: { gestione: 'in_pagamento', gestioneIl: new Date() },
      })
    } catch {
      // lo stato è un contorno: la richiesta resta salvata
    }
  }

  // ── L'ORDINE IMPARA SUBITO CHI LO PREPARA ──
  //
  // ⚠️⚠️ Chiesto dall'utente il 24/08/2026: «obbliga, al momento della richiesta
  // di un pagamento per un ordine, di inserire anche il fornitore». Prima
  // l'ordine lo imparava solo al «Pagata» — cioè restava senza fornitore per
  // tutto il tempo in cui serve saperlo: mentre lo si lavora, e mentre chi
  // risponde al cliente si chiede a chi telefonare.
  //
  // ⚠️ Non è un campo in più da compilare: chi va pagato è già obbligatorio, e
  // chiedere di pagare qualcuno PER UN ORDINE è già dire che lo prepara lui. Si
  // scrive quello che si è appena detto, invece di richiederlo due volte.
  //
  // ⚠️⚠️ I controlli restano gli stessi: se sull'ordine c'è già un fornitore
  // DIVERSO non si sovrascrive, e se il nome è quello del cliente non si tocca
  // niente (sarebbe un rimborso). Quello che non passa lo si DICE a chi ha
  // salvato — vedi `riconciliato` nella risposta.
  //
  // ⚠️ Un errore qui non fa fallire il salvataggio: la richiesta è la cosa che
  // conta, e perderla perché un contorno non è riuscito sarebbe il peggiore dei
  // due errori.
  let riconciliato: EsitoRiconciliazione | null = null
  if (richiesta.ordineNumero) {
    try {
      riconciliato = io
        ? await riconciliaDaPagamento(richiesta.id, io, 'richiesta')
        : null
    } catch {
      riconciliato = null
    }
  }

  // ── L AVVISO A CHI FA I BONIFICI ──
  //
  // ⚠️ Chiesto dall utente: ogni volta che arriva un pagamento da fare, un
  // messaggio WhatsApp. Non e un messaggio verso un fornitore o un cliente: e
  // un avviso a NOI, sul telefono di chi i bonifici li fa davvero.
  //
  // ⚠️⚠️ Funziona solo dentro la finestra di 24 ore di WhatsApp, e l esito si
  // RESTITUISCE: un avviso che fallisce in silenzio e peggio di nessun avviso,
  // perche si smette di guardare la pagina credendo che il telefono squilli.
  //
  // ⚠️ Un errore qui non fa fallire il salvataggio: la richiesta e la cosa che
  // conta.
  let avvisoInterno: { mandato: boolean; messaggio: string } | null = null
  try {
    avvisoInterno = await avvisaPagamentoDaFare(richiesta.id)
  } catch {
    avvisoInterno = null
  }

  // Inoltro a Deluxy Partner, che approva e paga. Un fallimento qui non annulla
  // il salvataggio: la richiesta resta e si può rimandare.
  let invio: { ok: boolean; messaggio: string } | null = null
  if (c.inviaAPartner !== false) {
    const esito = await inviaRichiestaPagamento({
      importo: richiesta.importo,
      beneficiario: richiesta.intestatario,
      iban: richiesta.iban,
      bic: richiesta.bic,
      causale: richiesta.causale,
      contatto: richiesta.contatto,
      linkConversazione: richiesta.linkConversazione,
      riferimento: richiesta.riferimento,
      note: richiesta.note,
    })
    if (esito.stato === 'ok') {
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: {
          inviataIl: new Date(),
          partnerId: esito.id,
          partnerStato: esito.statoRichiesta,
          canale: esito.canale,
          esitoInvio: '',
        },
      })
      invio = {
        ok: true,
        messaggio: `Inviata a ${esito.canale === 'transactions' ? 'Transactions' : 'Partner'} (${esito.statoRichiesta}).`,
      }
    } else if (esito.stato === 'non-configurato') {
      invio = { ok: false, messaggio: 'Salvata qui: nessun canale di pagamento configurato.' }
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: { esitoInvio: 'Nessun canale di pagamento configurato' },
      })
    } else {
      invio = { ok: false, messaggio: `Salvata qui, ma non inviata: ${esito.messaggio}` }
      await db.richiestaPagamento.update({
        where: { id: richiesta.id },
        data: { esitoInvio: esito.messaggio },
      })
    }
  }

  const aggiornata = await db.richiestaPagamento.findUnique({ where: { id: richiesta.id } })
  return NextResponse.json({
    richiesta: { ...aggiornata, stringa: stringaPagamento(richiesta) },
    motivoIban: esitoIban.motivo,
    invio,
    // ⚠️ L'esito si RESTITUISCE: se il fornitore non e stato scritto
    // sull'ordine (c era gia un altro nome, o quel nome e del cliente) chi ha
    // salvato deve saperlo adesso, non scoprirlo fra tre giorni.
    riconciliato,
    avvisoInterno,
  })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.richiestaPagamento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
