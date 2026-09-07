import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { righeOrdineDaOrders } from '@/lib/orders'
import { utenteCorrente } from '@/lib/sessione'
import { propostaVendita } from '@/lib/vendite'

export const dynamic = 'force-dynamic'

// La PROPOSTA DI VENDITA per un ordine (nuova architettura 06/09/2026): a chi
// proporlo, in che ordine, con che sconto — e l'anomalia «deluxy.it fuori
// provincia senza extra pagato» quando c'è. Le righe e il destinatario si
// chiedono a Orders; chi c'è in provincia lo dice la piattaforma consegne.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const { id } = await ctx.params
  const ordine = await db.ordine.findUnique({ where: { id }, select: { id: true, numero: true, shopifyId: true, negozioNome: true, totale: true, citta: true } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })
  const pezzi = await righeOrdineDaOrders(ordine.numero, ordine.shopifyId ?? '')
  const righe = pezzi.stato === 'ok' ? pezzi.righe.map((r) => ({ prezzo: r.prezzo, quantita: r.quantita })) : null
  const provincia = pezzi.stato === 'ok' ? pezzi.spedizione?.provincia ?? '' : ''
  // Gli SKU servono a riconoscere i prodotti A PREVENTIVO: senza preventivo non si propone.
  const sku = pezzi.stato === 'ok' ? pezzi.righe.map((r) => r.sku).filter(Boolean) : []
  const proposta = await propostaVendita({ negozioNome: ordine.negozioNome ?? '', totale: ordine.totale ?? 0, righe, provincia: provincia || ordine.citta || '', sku, righe2: pezzi.stato === 'ok' ? pezzi.righe.map((r) => ({ titolo: r.titolo, variante: r.variante, sku: r.sku, quantita: r.quantita })) : [] })
  return NextResponse.json({ ordine: { id: ordine.id, numero: ordine.numero, negozio: ordine.negozioNome }, proposta })
}
