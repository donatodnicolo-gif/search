import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Gli script: le risposte pronte da dare ai clienti.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const script = await db.script.findMany({
    where: q
      ? {
          OR: [
            { titolo: { contains: q, mode: 'insensitive' } },
            { testo: { contains: q, mode: 'insensitive' } },
            { categoria: { contains: q, mode: 'insensitive' } },
            { quando: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ categoria: 'asc' }, { usi: 'desc' }, { titolo: 'asc' }],
  })
  return NextResponse.json({ script })
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    titolo?: string
    categoria?: string
    testo?: string
    quando?: string
    attivo?: boolean
  }
  const titolo = (c.titolo ?? '').trim()
  const testo = (c.testo ?? '').trim()
  if (!titolo || !testo) {
    return NextResponse.json({ errore: 'Servono un titolo e il testo della risposta.' }, { status: 400 })
  }

  const dati = {
    titolo,
    categoria: (c.categoria ?? '').trim() || 'Generale',
    testo,
    quando: (c.quando ?? '').trim(),
    ...(c.attivo === undefined ? {} : { attivo: c.attivo }),
  }

  const script = c.id
    ? await db.script.update({ where: { id: c.id }, data: dati })
    : await db.script.create({ data: dati })
  return NextResponse.json({ script })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.script.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
