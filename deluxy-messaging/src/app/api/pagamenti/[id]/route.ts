import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { verificaIban } from '@/lib/iban'
import { effettiPagata } from '@/lib/effetti-pagata'
import { segnaPagataFuoriTransactions, transactionsConfigurata } from '@/lib/transactions'
import { inviaRichiestaPagamento } from '@/lib/partner'
import {
  cosaManca,
  metodoValido,
  ricevutaAccettabile,
  TETTO_RICEVUTA,
} from '@/lib/metodo-pagamento'

export const dynamic = 'force-dynamic'
// Una ricevuta viaggia dentro il corpo: con una foto e una rete lenta i 10
// secondi di default non bastano.
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// CORREGGERE una richiesta salvata, oppure segnarla PAGATA con la ricevuta.
//
// ⚠️ Non esisteva nessuna delle due cose: una riga sbagliata si poteva solo
// cancellare e rifare — perdendo quando era stata scritta e da dove veniva — e
// «pagata» non si poteva dire affatto. L'app sapeva di aver *chiesto* un
// pagamento, e «chiesto» e «pagato» non sono la stessa cosa: con un fornitore
// che richiama per sapere se è stato pagato non c'era niente da guardare.

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const r = await db.richiestaPagamento.findUnique({ where: { id } })
  if (!r) return NextResponse.json({ errore: 'Richiesta non trovata.' }, { status: 404 })

  const c = (await req.json().catch(() => ({}))) as {
    azione?: 'modifica' | 'pagata' | 'nonpagata'
    iban?: string
    intestatario?: string
    /** Chi prepara l'ordine, se diverso dal nome sul conto (07/09/2026). */
    fornitore?: string
    importo?: number
    causale?: string
    metodo?: string
    riferimentoPagamento?: string
    ordineNumero?: string
    ricevuta?: { dati: string; nome: string; tipo: string; byte: number } | null
    /** Da dove è uscito il denaro: banca · app · contanti · compensazione · altro. */
    pagatoCon?: string
  }

  // ── SEGNARE CHE È STATA PAGATA ──
  if (c.azione === 'pagata' || c.azione === 'nonpagata') {
    if (c.azione === 'nonpagata') {
      // ⚠️ Se la chiusura è già arrivata a Transactions (o è stata Transactions
      // a pagare), qui non si disfa: di là la partita è chiusa e un «non
      // pagata» solo qui farebbe divergere le due app in silenzio.
      if (r.canale === 'transactions' && r.partnerStato === 'pagata') {
        return NextResponse.json(
          {
            errore:
              'Questa richiesta risulta pagata anche su Deluxy Transactions: qui non si può più togliere la spunta, ' +
              'e di là una richiesta chiusa non si riapre. Se è un errore, si fa una richiesta nuova.',
          },
          { status: 409 }
        )
      }
      // ⚠️ Si può disfare: capita di spuntare la riga sbagliata, e un segno che
      // non si toglie si smette di mettere. ⚠️ La ricevuta però resta: è un
      // documento, e cancellarla per un clic sbagliato sarebbe peggio.
      const tornata = await db.richiestaPagamento.update({
        where: { id },
        // ⚠️ Si azzera anche l'avviso: se il pagamento non c'è più, «avvisato»
        // sarebbe una bugia — e peggio, farebbe credere che il fornitore sappia
        // una cosa che non è vera.
        data: {
          pagataIl: null,
          pagataDaNome: '',
          pagatoCon: '',
          avvisoIl: null,
          avvisoCanale: '',
          avvisoEsito: '',
        },
      })
      return NextResponse.json({ richiesta: tornata })
    }

    const dati: Record<string, unknown> = {
      pagataIl: new Date(),
      pagataDaNome: io.nome,
      // ⚠️ Solo se ce l'ha detto. Vuoto resta «non indicato»: indovinare il
      // canale di un'uscita di denaro manderebbe qualcuno, fra sei mesi, a
      // cercare quel bonifico dove non è mai passato.
      pagatoCon: (c.pagatoCon ?? '').trim(),
    }
    if (c.ricevuta) {
      const problema = ricevutaAccettabile(c.ricevuta.tipo, c.ricevuta.byte)
      if (problema) return NextResponse.json({ errore: problema }, { status: 400 })
      // ⚠️ Si ricontrolla anche la lunghezza del testo: `byte` lo dice il
      // browser, e quello che arriva davvero è questa stringa.
      if ((c.ricevuta.dati || '').length > TETTO_RICEVUTA * 1.4) {
        return NextResponse.json({ errore: 'La ricevuta è troppo pesante.' }, { status: 400 })
      }
      dati.ricevutaDati = c.ricevuta.dati
      dati.ricevutaNome = (c.ricevuta.nome || '').slice(0, 120)
      dati.ricevutaTipo = c.ricevuta.tipo
    }
    const pagata = await db.richiestaPagamento.update({ where: { id }, data: dati })

    // ── TRANSACTIONS LO VIENE A SAPERE (05/09/2026) ──
    // Se questa richiesta era già in coda di là e non è stata Transactions a
    // pagarla, di là va chiusa come «pagata fuori dall'app»: altrimenti resta
    // in attesa e un operatore la paga una seconda volta (con Finance era
    // successo su 7 richieste, 4.794 €). L'esito torna alla pagina e, se
    // fallisce, resta scritto sulla riga (`esitoInvio`): la spunta qui vale
    // comunque, ma qualcuno deve chiudere a mano di là.
    let transactions: { ok: boolean; messaggio: string } | null = null
    if (r.canale === 'transactions' && r.inviataIl && r.partnerStato !== 'pagata' && transactionsConfigurata()) {
      const t = await segnaPagataFuoriTransactions({
        riferimento: r.riferimento,
        pagatoCon: String(dati.pagatoCon),
        pagataIl: dati.pagataIl as Date,
        pagataDa: io.nome,
      })
      transactions = t.ok ? { ok: true, messaggio: t.messaggio } : { ok: false, messaggio: t.errore }
      await db.richiestaPagamento.update({
        where: { id },
        data: t.ok
          ? { partnerStato: 'pagata', esitoInvio: '' }
          : { esitoInvio: `Pagata qui ma NON chiusa su Transactions — ${t.errore} Va chiusa a mano da un operatore dentro Transactions.` },
      })
    }

    // ⚠️ L'ESITO NON RESTA MUTO. Gli effetti (ordine spostato, riconciliazione,
    // avviso al fornitore, registro anagrafiche) sono in `effettiPagata()` —
    // UNA strada sola, la stessa che percorre il webhook di Transactions
    // (28/08/2026) — e ognuno restituisce il suo esito, che la pagina scrive.
    // Le ragioni e i casi reali di ogni blocco stanno lì.
    const effetti = await effettiPagata(id, { id: io.id, nome: io.nome })
    const conAvviso = await db.richiestaPagamento.findUnique({
      where: { id },
      select: { avvisoIl: true, avvisoCanale: true, avvisoEsito: true },
    })

    return NextResponse.json({
      richiesta: { ...pagata, ...conAvviso },
      avviso: effetti.avviso,
      riconciliato: effetti.riconciliato,
      registro: effetti.registro,
      // ⚠️ Cos'è successo all'ORDINE: la pagina lo scrive. '' = non c'era un
      // ordine collegato, o era già avanti.
      ordine: { stato: effetti.statoOrdine, orders: effetti.versoOrders },
      // Cos'è successo su TRANSACTIONS: null = non era in coda di là.
      transactions,
    })
  }


  // ── CORREGGERE ──
  //
  // ⚠️⚠️ Solo finché NON è stata mandata a chi approva. Dopo, quello che c'è
  // qui e quello che ha in mano l'altra app divergerebbero in silenzio: si
  // leggerebbe un importo e ne verrebbe pagato un altro. Si dice, invece di
  // impedirlo senza spiegare.
  if (r.inviataIl) {
    return NextResponse.json(
      {
        errore:
          'Questa richiesta è già stata mandata a chi approva: correggerla qui la farebbe diverge' +
          'e da quella che hanno loro. Elimina questa e rifalla, oppure correggila da là.',
      },
      { status: 409 }
    )
  }

  const metodo = (c.metodo ?? r.metodo).trim()
  if (!metodoValido(metodo)) {
    return NextResponse.json({ errore: 'Metodo di pagamento non valido.' }, { status: 400 })
  }
  const iban = (c.iban ?? r.iban).trim()
  const intestatario = (c.intestatario ?? r.intestatario).trim()
  // Chi prepara, separato dal nome sul conto (07/09/2026): si corregge come
  // gli altri campi, e se il modulo non lo manda resta quello che c'era.
  const fornitore = (c.fornitore ?? r.fornitore).trim()
  const riferimento = (c.riferimentoPagamento ?? r.riferimentoPagamento).trim()

  const manca = cosaManca({ metodo, iban, riferimento, intestatario })
  if (manca) return NextResponse.json({ errore: manca }, { status: 400 })

  // ⚠️ L'IBAN si riverifica a ogni correzione: se non lo si rifacesse, una riga
  // nata valida resterebbe segnata «valido» anche dopo averci scritto dentro
  // un'altra cosa. E su un metodo che non è un bonifico non c'è niente da
  // verificare: `false` qui vuol dire «non applicabile», non «sbagliato».
  const esito = metodo === 'iban' ? verificaIban(iban) : null

  const corretta = await db.richiestaPagamento.update({
    where: { id },
    data: {
      metodo,
      // ⚠️ Normalizzato come alla creazione (senza spazi, maiuscolo): prima la
      // correzione salvava l'IBAN com'era battuto, e lo stesso IBAN risultava
      // scritto in due modi a seconda di come era entrato.
      iban: metodo === 'iban' ? (esito?.normalizzato ?? iban) : '',
      riferimentoPagamento: metodo === 'iban' ? '' : riferimento,
      intestatario,
      fornitore,
      importo: typeof c.importo === 'number' && c.importo >= 0 ? c.importo : r.importo,
      causale: (c.causale ?? r.causale).trim(),
      ordineNumero: (c.ordineNumero ?? r.ordineNumero).trim(),
      ibanValido: esito ? esito.valido : false,
      ibanPaese: esito ? esito.paese : '',
      // ⚠️⚠️ L'esito del VECCHIO invio si cancella qui: descriveva la riga
      // com'era prima («IBAN non valido»), e lasciarlo sulla riga corretta è
      // esattamente il difetto segnalato dall'utente il 05/09/2026: «la
      // modifica non produce nessun risultato e i messaggi rimangono gli
      // stessi». Qui sotto si riscrive con quello che succede ADESSO.
      esitoInvio: '',
    },
  })

  // ── SI RIPROVA L'INVIO, DA SOLO (05/09/2026) ──
  //
  // ⚠️⚠️ Una richiesta si corregge quasi sempre perché l'invio era stato
  // RIFIUTATO (l'AI aveva letto un IBAN di 26 caratteri invece di 27,
  // Transactions ha risposto 400). Correggere e basta lasciava la riga «non
  // inviata» con il vecchio errore nel titolo, e per farla partire bisognava
  // sapere che esiste il bottone «Invia». Il caso vero: GRIFFO FRANCESCO D.I.,
  // 05/09 ore 15:31. Adesso la correzione fa quello che ha fatto la creazione:
  // prova a mandarla, e dice com'è andata.
  //
  // ⚠️ Se l'IBAN ancora non torna non si chiama Transactions per sentirsi dire
  // di no: lo si scrive qui, con il motivo, e la riga resta «non inviata».
  let invio: { ok: boolean; messaggio: string } | null = null
  // ⚠️⚠️ UNA RICHIESTA GIÀ PAGATA QUI NON SI MANDA DI LÀ (11/09/2026).
  //
  // Misurato con Transactions: nella loro coda stavano 41 richieste del
  // Customer Service (3.638,00 €) ancora aperte, e **tutte e 41 erano già
  // pagate qui**. Le tre più recenti raccontano come ci si arriva: pagate
  // prima e mandate dopo — «Missure Rosamaria» pagata alle 09:52:46 e spedita
  // alle 09:52:58, dodici secondi più tardi.
  //
  // La regola del 05/09 copre il verso opposto (si preme «Pagata» su una già
  // mandata, e allora si chiude anche di là). Questo è il verso che mancava, e
  // fa lo stesso danno al contrario: una richiesta in coda per soldi che sono
  // già usciti è un invito a pagarli una seconda volta.
  if (corretta.pagataIl) {
    const messaggio =
      'Non inviata: questa richiesta risulta già PAGATA qui. Mandarla a Transactions vorrebbe dire metterla in coda per dei soldi già usciti.'
    await db.richiestaPagamento.update({ where: { id }, data: { esitoInvio: messaggio } })
    invio = { ok: false, messaggio }
  } else if (metodo === 'iban' && esito && !esito.valido) {
    const messaggio = `Non inviata: ${esito.motivo}`
    await db.richiestaPagamento.update({ where: { id }, data: { esitoInvio: messaggio } })
    invio = { ok: false, messaggio }
  } else if (!(corretta.importo > 0)) {
    const messaggio = 'Non inviata: serve un importo maggiore di zero.'
    await db.richiestaPagamento.update({ where: { id }, data: { esitoInvio: messaggio } })
    invio = { ok: false, messaggio }
  } else {
    const e = await inviaRichiestaPagamento({
      importo: corretta.importo,
      beneficiario: corretta.intestatario,
      iban: corretta.iban,
      metodo: corretta.metodo,
      riferimentoPagamento: corretta.riferimentoPagamento,
      bic: corretta.bic,
      causale: corretta.causale,
      contatto: corretta.contatto,
      linkConversazione: corretta.linkConversazione,
      riferimento: corretta.riferimento,
      note: corretta.note,
    })
    if (e.stato === 'ok') {
      await db.richiestaPagamento.update({
        where: { id },
        data: {
          inviataIl: new Date(),
          partnerId: e.id,
          partnerStato: e.statoRichiesta,
          canale: e.canale,
          esitoInvio: '',
        },
      })
      invio = { ok: true, messaggio: `Inviata a Transactions (${e.statoRichiesta}).` }
    } else if (e.stato === 'non-configurato') {
      await db.richiestaPagamento.update({
        where: { id },
        data: { esitoInvio: 'Nessun canale di pagamento configurato' },
      })
      invio = { ok: false, messaggio: 'Corretta qui: nessun canale di pagamento configurato.' }
    } else {
      await db.richiestaPagamento.update({ where: { id }, data: { esitoInvio: e.messaggio } })
      invio = { ok: false, messaggio: `Corretta qui, ma non inviata: ${e.messaggio}` }
    }
  }

  const aggiornata = await db.richiestaPagamento.findUnique({ where: { id } })
  return NextResponse.json({ richiesta: aggiornata, motivoIban: esito?.motivo ?? '', invio })
}
