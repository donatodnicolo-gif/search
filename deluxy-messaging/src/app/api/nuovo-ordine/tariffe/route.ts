import { NextRequest, NextResponse } from 'next/server'
import { tariffeConsegna } from '@/lib/nuovo-ordine'
import { stimaFuoriZona } from '@/lib/consegna-fuori-zona'
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
  if (esito.tariffe.length) return NextResponse.json({ tariffe: esito.tariffe })
  const righe = (c.righe ?? []).map((r) => ({
    variantId: r.variantId,
    titolo: r.titolo,
    prezzo: r.prezzo,
    quantita: Math.max(1, r.quantita ?? 1),
  }))
  const s = await stimaFuoriZona(
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
    tariffe: [],
    stima: s.stato === 'ok' ? s.stima : null,
    stimaStato: s.stato,
    // Il perche del «troppo lontano»: senza i chilometri sarebbe un rifiuto
    // senza motivo, e chi legge non saprebbe se e un guasto o una distanza.
    stimaKm: s.stato === 'troppo-lontano' ? s.km : null,
    stimaPartenza: s.stato === 'troppo-lontano' ? s.partenza : '',
  })
}
