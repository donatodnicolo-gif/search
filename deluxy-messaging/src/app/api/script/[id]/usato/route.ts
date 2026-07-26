import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Segna che uno script è stato usato davvero: `usi` cresce e l'elenco mette i più
// usati in cima (`orderBy: usi desc` in /api/script).
//
// Lo fa già l'AI quando ne sceglie uno (/api/script/suggerisci): se il conteggio
// non crescesse anche quando è una persona a prenderlo dal pop-up di posta,
// l'ordinamento racconterebbe le abitudini dell'AI e non quelle di chi lavora.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const script = await db.script.findUnique({ where: { id } })
  if (!script) return NextResponse.json({ errore: 'Script non trovato' }, { status: 404 })

  const aggiornato = await db.script.update({
    where: { id },
    data: { usi: { increment: 1 } },
  })
  return NextResponse.json({ usi: aggiornato.usi })
}
