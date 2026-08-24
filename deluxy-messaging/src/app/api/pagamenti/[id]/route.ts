import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { verificaIban } from '@/lib/iban'
import { avvisaFornitorePagato } from '@/lib/avvisa-pagamento'
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

    // ── L'ORDINE ESCE DA «IN PAGAMENTO» ──
    //
    // ⚠️ Segnalato dall'utente: un ordine con il pagamento fatto continuava a
    // dire «In pagamento», cioè lo stato di quando lo si stava pagando. Quel
    // passo è finito, e il successivo nel loro flusso è «attesa consegna».
    //
    // ⚠️ SOLO da `in_pagamento`, e quindi solo in avanti. Da uno stato più
    // avanti non si torna indietro, e da uno più indietro non si salta: se
    // l'ordine è ancora «da gestire» vuol dire che è successo qualcosa di
    // diverso da quello che crediamo, e indovinare peggiorerebbe le cose.
    //
    // ⚠️ Togliendo il segno «pagata» l'ordine NON torna indietro: era già stato
    // spostato a mano da qualcuno, forse, e riportarlo a «in pagamento»
    // cancellerebbe una decisione di una persona per disfare un clic.
    if (pagata.ordineNumero) {
      try {
        await db.ordine.updateMany({
          where: { numero: pagata.ordineNumero, gestione: 'in_pagamento' },
          data: { gestione: 'attesa_consegna', gestioneIl: new Date() },
        })
      } catch {
        // lo stato è un contorno: il pagamento resta registrato
      }
    }

    // ── L'AVVISO AL FORNITORE, DA SOLO ──
    //
    // ⚠️ Chiesto esplicitamente: «l'avviso del pagamento è automatico». Parte
    // solo perché una persona ha premuto «Pagata» — è la differenza fra
    // «automatico» e «da solo».
    //
    // ⚠️⚠️ Un fallimento qui NON fa fallire la registrazione del pagamento: il
    // denaro è uscito comunque, e perdere quel fatto perché un messaggio non è
    // partito sarebbe il peggiore dei due errori. L'esito si scrive e si mostra.
    let avviso: { canale: string; errore: string } = { canale: '', errore: '' }
    try {
      avviso = await avvisaFornitorePagato(id)
    } catch (e) {
      avviso = { canale: '', errore: e instanceof Error ? e.message : 'errore' }
    }
    const conAvviso = await db.richiestaPagamento.update({
      where: { id },
      data: {
        avvisoIl: new Date(),
        avvisoCanale: avviso.canale,
        avvisoEsito: avviso.errore,
      },
      select: { avvisoIl: true, avvisoCanale: true, avvisoEsito: true },
    })
    return NextResponse.json({ richiesta: { ...pagata, ...conAvviso }, avviso })
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
  const riferimento = (c.riferimentoPagamento ?? r.riferimentoPagamento).trim()

  const manca = cosaManca({ metodo, iban, riferimento, intestatario })
  if (manca) return NextResponse.json({ errore: manca }, { status: 400 })

  // ⚠️ L'IBAN si riverifica a ogni correzione: se non lo si rifacesse, una riga
  // nata valida resterebbe segnata «valido» anche dopo averci scritto dentro
  // un'altra cosa. E su un metodo che non è un bonifico non c'è niente da
  // verificare: `false` qui vuol dire «non applicabile», non «sbagliato».
  const esito = metodo === 'iban' ? verificaIban(iban) : null

  const aggiornata = await db.richiestaPagamento.update({
    where: { id },
    data: {
      metodo,
      iban: metodo === 'iban' ? iban : '',
      riferimentoPagamento: metodo === 'iban' ? '' : riferimento,
      intestatario,
      importo: typeof c.importo === 'number' && c.importo >= 0 ? c.importo : r.importo,
      causale: (c.causale ?? r.causale).trim(),
      ordineNumero: (c.ordineNumero ?? r.ordineNumero).trim(),
      ibanValido: esito ? esito.valido : false,
      ibanPaese: esito ? esito.paese : '',
    },
  })
  return NextResponse.json({ richiesta: aggiornata, motivoIban: esito?.motivo ?? '' })
}
