import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I valet: chi fa le consegne. Registro locale (non esiste altrove), serve a
// imputare la colpa di un reclamo a una persona e a darle un giudizio.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const soloAttivi = req.nextUrl.searchParams.get('attivi') === '1'
  const valet = await db.valet.findMany({
    where: {
      ...(soloAttivi ? { attivo: true } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { telefono: { contains: q } },
              { zona: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ attivo: 'desc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ valet })
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    nome?: string
    telefono?: string
    email?: string
    zona?: string
    note?: string
    attivo?: boolean
  }
  const nome = (c.nome ?? '').trim()
  if (!nome) return NextResponse.json({ errore: 'Serve il nome del valet.' }, { status: 400 })

  const dati = {
    nome,
    telefono: (c.telefono ?? '').trim(),
    email: (c.email ?? '').trim(),
    zona: (c.zona ?? '').trim(),
    note: (c.note ?? '').trim(),
    ...(c.attivo === undefined ? {} : { attivo: c.attivo }),
  }

  const valet = c.id
    ? await db.valet.update({ where: { id: c.id }, data: dati })
    : await db.valet.create({ data: dati })
  return NextResponse.json({ valet })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.valet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
