import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { tariffeConStima, type RichiestaTariffe } from '@/lib/tariffe-con-stima'

export const dynamic = 'force-dynamic'
// Una chiamata a Shopify (e due-tre a Google per la stima): i 10 secondi sono stretti.
export const maxDuration = 30

// POST /api/v1/nuovo-ordine/tariffe — le tariffe di consegna che il SITO offre
// per questo carrello e questo indirizzo, più la stima al chilometro fuori
// zona, per le altre app (il CRM, 11/09/2026). Stesso conto della schermata
// interna (src/lib/tariffe-con-stima.ts). POST perché servono indirizzo e
// righe: certe zone sono gratis oltre una soglia di spesa.
//
// Body: { negozioId, indirizzo{indirizzo,citta,cap,provincia,paese},
//         righe[{variantId | titolo+prezzo, quantita}] }
// → { tariffe: [{titolo,prezzo,valuta}], stima?, stimaStato?, stimaKm?, stimaPartenza? }
export async function POST(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  let c: RichiestaTariffe
  try {
    c = (await req.json()) as RichiestaTariffe
  } catch {
    return erroreApi(400, 'Corpo non valido: serve un JSON')
  }
  const r = await tariffeConStima(c)
  return NextResponse.json(r.corpo, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}
