import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { verificaIban } from '@/lib/iban'
import { effettiPagata } from '@/lib/effetti-pagata'
import { segnaPagataFuoriTransactions, transactionsConfigurata } from '@/lib/transactions'
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
