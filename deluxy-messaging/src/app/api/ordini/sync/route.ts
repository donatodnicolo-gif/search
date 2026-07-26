import { NextRequest, NextResponse } from 'next/server'
import { annotaSync, sincronizzaOrdini } from '@/lib/sincronizza'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Gli ordini arrivano dal registro centralizzato Deluxy Orders (che a sua volta
// sincronizza Shopify): una sola fonte di verità per tutte le app, con la stessa
// classificazione. Qui se ne tiene una copia recente per lavorarci in inbox.
//
// Questo è il pulsante "Aggiorna" a mano; il giro automatico ogni 15 minuti è in
// /api/cron/ordini. La logica è condivisa: src/lib/sincronizza.ts.
export async function POST(req: NextRequest) {
  const completo = req.nextUrl.searchParams.get('completo') === '1'
  try {
    const esito = await sincronizzaOrdini({ completo })
    await annotaSync({ ok: true, nota: `${esito.scaricati} ordini, ${esito.nuovi} nuovi (a mano)` })
    return NextResponse.json(esito)
  } catch (e) {
    const messaggio = (e as Error).message
    await annotaSync({ ok: false, nota: messaggio })
    return NextResponse.json({ errore: messaggio }, { status: 502 })
  }
}
