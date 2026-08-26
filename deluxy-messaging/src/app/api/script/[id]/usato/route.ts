import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Segna che uno script è stato usato davvero: `usi` cresce e l'elenco mette i più
// usati in cima (`orderBy: usi desc` in /api/script).
//
// Lo fa già l'AI quando ne sceglie uno (/api/script/suggerisci): se il conteggio
// non crescesse anche quando è una persona a prenderlo dal pop-up di posta,
// l'ordinamento racconterebbe le abitudini dell'AI e non quelle di chi lavora.
export async function POST(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const script = await db.script.findUnique({ where: { id } })
  if (!script) return NextResponse.json({ errore: 'Script non trovato' }, { status: 404 })

  const aggiornato = await db.script.update({
    where: { id },
    data: { usi: { increment: 1 } },
  })
  return NextResponse.json({ usi: aggiornato.usi })
}
