import { NextRequest, NextResponse } from 'next/server'
import { autentica } from '@/lib/api-auth'
import { numeriCollegati } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'

// GET /api/v1/whatsapp/numeri — i NOSTRI numeri WhatsApp Business, per far
// scegliere alle altre app da quale marchio esce il messaggio. Niente token:
// solo id, etichetta, numero visibile e marchio.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const numeri = await numeriCollegati()
  return NextResponse.json(
    {
      numeri: numeri.map((n) => ({
        phoneNumberId: n.phoneNumberId,
        nome: n.nome,
        numeroVisibile: n.numeroVisibile,
        brand: n.brand,
        attivo: n.attivo,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
