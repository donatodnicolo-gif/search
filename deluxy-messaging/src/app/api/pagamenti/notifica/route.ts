import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { notificaAutentica, scaricaAllegatoTransactions } from '@/lib/transactions'
import { effettiPagata } from '@/lib/effetti-pagata'
import { ricevutaAccettabile } from '@/lib/metodo-pagamento'

// Il webhook degli ESITI da Deluxy Transactions (28/08/2026).
//
// Da quando Transactions è il collettore unico, «pagata» non si registra più a
// mano qui: arriva da chi ha fatto uscire il denaro, con la prova allegata.
// Questo receiver:
//   1. verifica la FIRMA prima di leggere il corpo (fail-closed: senza
//      segreto, 503 — mai «se c'è il segreto verifica», Legge 10);
//   2. risponde 200 SUBITO e fa il lavoro pesante dopo (`after()`): il
//      mittente ha un timeout di 4 s e ritenta — un receiver lento
//      produrrebbe doppi avvisi;
//   3. è IDEMPOTENTE: la stessa notifica può arrivare due volte (i
//      ritentativi sono rifirmati), e un secondo arrivo non rifà gli effetti
//      (niente secondo avviso WhatsApp al fornitore).
//
// La riga si aggiorna con la STESSA strada del bottone «Pagata»
// (`effettiPagata`): ordine in attesa_consegna, riconciliazione, avviso al
// fornitore, registro anagrafiche. La prova si scarica con GET firmata e
// sha256 verificato — mai dai byte del webhook, mai da un URL nel payload.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chi firma gli effetti quando il gesto arriva da Transactions: non è un
// utente di quest'app. `id` vuoto = il default di `gestioneDaId`.
const ATTORE_TRANSACTIONS = { id: '', nome: 'Deluxy Transactions' }

type Payload = {
  riferimento?: string
  riferimentoEsterno?: string
  stato?: string
  metodo?: string
  pagataIl?: string | null
  pagatoCon?: string | null
  motivo?: string | null
  allegati?: { id: string; nome: string; tipo: string; byte: number; ruolo: string; sha256: string }[]
}

/** Lo stato di Transactions nel vocabolario della nostra colonna. */
function partnerStatoDa(stato: string): string {
  if (stato === 'pagata') return 'pagata'
  if (stato === 'approvata' || stato === 'in_lotto') return 'approvata'
  if (stato === 'rifiutata' || stato === 'annullata') return 'rifiutata'
  return 'in_attesa'
}

export async function POST(req: NextRequest) {
  const segreto = (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  if (!segreto) {
    // Fail-closed: un webhook senza verifica sarebbe una porta per esiti falsi.
    return NextResponse.json({ errore: 'Canale non configurato.' }, { status: 503 })
  }
  const corpo = await req.text()
  if (!notificaAutentica(corpo, req.headers)) {
    return NextResponse.json({ errore: 'Firma non valida.' }, { status: 401 })
  }

  let payload: Payload
  try {
    payload = JSON.parse(corpo) as Payload
  } catch {
    return NextResponse.json({ errore: 'Corpo non valido.' }, { status: 400 })
  }

  // Il riferimento esterno è nostro: `cs-<riferimento della RichiestaPagamento>`.
  const rifEsterno = payload.riferimentoEsterno ?? ''
  if (!rifEsterno.startsWith('cs-')) {
    return NextResponse.json({ ok: true, nota: 'Riferimento non nostro: ignorata.' })
  }
  const riferimento = rifEsterno.slice(3)
  const r = await db.richiestaPagamento.findUnique({ where: { riferimento } })
  if (!r) return NextResponse.json({ ok: true, nota: 'Richiesta non trovata: ignorata.' })

  const stato = payload.stato ?? ''
  const nuovoPartnerStato = partnerStatoDa(stato)
  const giaPagata = Boolean(r.pagataIl)
  const prova = (payload.allegati ?? []).find((a) => a.ruolo === 'prova') ?? null

  // La colonna di stato si aggiorna subito: è una scrittura piccola e
  // ripetibile (stesso valore = stesso risultato).
  await db.richiestaPagamento.update({
    where: { id: r.id },
    data: {
      partnerStato: nuovoPartnerStato,
      ...(stato === 'annullata' || stato === 'rifiutata'
        ? { esitoInvio: payload.motivo ? `Transactions: ${payload.motivo}` : `Transactions: ${stato}` }
        : {}),
    },
  })

  // Il lavoro pesante dopo la risposta: il mittente ha 4 secondi.
  after(async () => {
    // ── LA PROVA ── si scarica firmata e verificata, e si salva nei campi
    // ricevuta ESISTENTI (deroga scritta, giuria 28/08: la UI del CS — la
    // graffetta — resta identica; accanto ai byte resta l'aggancio per id
    // dentro `pagatoCon`/registro eventi di Transactions). Mai due volte: se
    // una ricevuta c'è già, la prima vince.
    let ricevuta: { dati: string; nome: string; tipo: string } | null = null
    if (prova && !r.ricevutaDati && payload.riferimento) {
      const problema = ricevutaAccettabile(prova.tipo, prova.byte)
      if (!problema) {
        const scaricata = await scaricaAllegatoTransactions(payload.riferimento, prova.id, prova.sha256)
        if (scaricata.ok) {
          ricevuta = {
            dati: `data:${prova.tipo};base64,${scaricata.dati.toString('base64')}`,
            nome: prova.nome.slice(0, 120),
            tipo: prova.tipo,
          }
        }
      }
    }

    if (stato === 'pagata' && !giaPagata) {
      // ── PAGATA, DETTO DA CHI HA PAGATO ── `pagatoCon: 'app'` è il valore
      // che la lista USCITE traduce «da Deluxy Transactions»; se invece
      // Transactions registra un pagamento fatto altrove (fuori_app), il
      // canale vero non lo sappiamo: resta «app» come provenienza dell'esito,
      // col motivo nelle note dell'evento di là.
      await db.richiestaPagamento.update({
        where: { id: r.id },
        data: {
          pagataIl: payload.pagataIl ? new Date(payload.pagataIl) : new Date(),
          pagataDaNome: 'Deluxy Transactions',
          pagatoCon: 'app',
          ...(ricevuta
            ? { ricevutaDati: ricevuta.dati, ricevutaNome: ricevuta.nome, ricevutaTipo: ricevuta.tipo }
            : {}),
        },
      })
      // Gli EFFETTI: la stessa strada del bottone. Una volta sola — la
      // guardia è `giaPagata` letta prima, e il partnerStato già a `pagata`
      // fa da secondo filtro per i ritentativi arrivati insieme.
      try {
        await effettiPagata(r.id, ATTORE_TRANSACTIONS)
      } catch {
        // best-effort: il pagamento resta registrato
      }
    } else if (ricevuta) {
      // Già pagata (o non ancora): la prova nuova si conserva comunque.
      await db.richiestaPagamento.update({
        where: { id: r.id },
        data: { ricevutaDati: ricevuta.dati, ricevutaNome: ricevuta.nome, ricevutaTipo: ricevuta.tipo },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
