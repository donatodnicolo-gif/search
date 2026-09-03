import { NextRequest, NextResponse } from 'next/server'
import { tariffeConsegna } from '@/lib/nuovo-ordine'
import { cittaDiCasa, stimaFuoriZona } from '@/lib/consegna-fuori-zona'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Una chiamata a Shopify per calcolare la spedizione: i 10 secondi sono stretti.
export const maxDuration = 30

// Le tariffe di consegna che Shopify offre per questo carrello e questo
// indirizzo — calcolate dal sito, non scritte a mano.
//
// ⚠️ POST e non GET: servono l'indirizzo e le righe dell'ordine, e la tariffa
// dipende da tutti e due (certe zone sono gratis oltre una soglia di spesa).
export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const c = (await req.json().catch(() => ({}))) as {
    negozioId?: string
    indirizzo?: { indirizzo?: string; citta?: string; cap?: string; provincia?: string; paese?: string }
    righe?: { variantId?: string; titolo?: string; prezzo?: number; quantita?: number }[]
  }
  const negozioId = (c.negozioId ?? '').trim()
  if (!negozioId) return NextResponse.json({ tariffe: [] })

  const esito = await tariffeConsegna(
    negozioId,
    {
      citta: c.indirizzo?.citta ?? '',
      cap: c.indirizzo?.cap ?? '',
      provincia: c.indirizzo?.provincia ?? '',
      paese: c.indirizzo?.paese ?? 'IT',
    },
    (c.righe ?? []).map((r) => ({
      variantId: r.variantId,
      titolo: r.titolo,
      prezzo: r.prezzo,
      quantita: Math.max(1, r.quantita ?? 1),
    }))
  )
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }
  if (esito.stato === 'senza-negozio') {
    return NextResponse.json({ errore: 'Negozio non trovato.' }, { status: 400 })
  }
  // ⚠️⚠️ Il sito non ha una tariffa per la consegna: e una risposta vera
  // (una provincia fuori dalle zone), e finora finiva in un campo vuoto. Qui si
  // aggiunge una STIMA al chilometro — mostrata, mai scritta da sola: la
  // decisione resta di chi sta al telefono.
  //
  // ⚠️ Si calcola solo in questo caso: dentro le zone il listino e del sito, e
  // il sito vince sempre (Standard §7). Costa due-tre chiamate a Google piu una
  // a Shopify, e non si spendono quando non servono.
  // ⚠️⚠️ La stima si calcola anche QUANDO una tariffa c'e, se la consegna e
  // fuori dalle citta da cui usciamo. Misurato il 02/09: Cake chiede 10 EUR
  // piatti ovunque — anche a Palermo (bozza #D269, pagata) — e Flowers
  // consegna gratis anche a Miami Beach. Il sito resta il listino e nessuno
  // gli scrive sopra, ma chi sta al telefono deve VEDERE quanto costa
  // davvero portarcelo, per decidere se mettere un importo suo.
  const cittaConsegna = (c.indirizzo?.citta ?? '').trim().toLowerCase()
  // ⚠️ Anche questa non deve poter far cadere le tariffe: se le impostazioni
  // non si leggono, si considera «non in casa» e al massimo si prova una stima.
  const casa = await cittaDiCasa().catch(() => [] as string[])
  const inCasa = casa.includes(cittaConsegna)
  if (esito.tariffe.length && (inCasa || !cittaConsegna)) {
    return NextResponse.json({ tariffe: esito.tariffe })
  }
  const righe = (c.righe ?? []).map((r) => ({
    variantId: r.variantId,
    titolo: r.titolo,
    prezzo: r.prezzo,
    quantita: Math.max(1, r.quantita ?? 1),
  }))
  // ⚠️⚠️ La stima non può far cadere le TARIFFE. Se Google o le impostazioni
  // sbagliano un colpo, prima l'eccezione usciva dalla rotta: il modulo mostrava
  // un errore rosso al posto del prezzo del sito, che era lì e funzionava. Un
  // di-più che rompe quello che c'era è peggio di non averlo fatto.
  const s = await stimaConCautela(
    negozioId,
    {
      indirizzo: c.indirizzo?.indirizzo ?? '',
      citta: c.indirizzo?.citta ?? '',
      cap: c.indirizzo?.cap ?? '',
      provincia: c.indirizzo?.provincia ?? '',
      paese: c.indirizzo?.paese ?? 'IT',
    },
    righe
  )
  return NextResponse.json({
    tariffe: esito.tariffe,
    stima: s.stato === 'ok' ? s.stima : null,
    stimaStato: s.stato,
    // Il perche del «troppo lontano»: senza i chilometri sarebbe un rifiuto
    // senza motivo, e chi legge non saprebbe se e un guasto o una distanza.
    stimaKm: s.stato === 'troppo-lontano' ? s.km : null,
    stimaPartenza: s.stato === 'troppo-lontano' ? s.partenza : '',
  })
}

/** La stima, ma non può mai lanciare: al massimo non c'è. */
async function stimaConCautela(
  ...argomenti: Parameters<typeof stimaFuoriZona>
): Promise<Awaited<ReturnType<typeof stimaFuoriZona>>> {
  try {
    return await stimaFuoriZona(...argomenti)
  } catch {
    // «senza-strada» e non un errore: chi sta al telefono deve vedere i campi
    // per scriverci il prezzo, non un allarme rosso su cui non può fare niente.
    return { stato: 'senza-strada', provate: [] }
  }
}
