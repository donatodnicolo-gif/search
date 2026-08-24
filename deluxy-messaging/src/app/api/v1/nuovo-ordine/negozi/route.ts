import { NextRequest, NextResponse } from 'next/server'
import { autentica } from '@/lib/api-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/v1/nuovo-ordine/negozi — i negozi Shopify su cui si può creare un
// ordine. Solo id, nome e dominio: le credenziali non escono di qui.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const negozi = await db.negozioShopify.findMany({
    select: { id: true, nome: true, dominio: true },
    orderBy: { nome: 'asc' },
  })
  return NextResponse.json({ negozi }, { headers: { 'Cache-Control': 'no-store' } })
}
