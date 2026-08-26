import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le consegne misurate sugli ORARI: reggono la voce "Puntualità" dei valet.
//
// Si salva il RITARDO IN MINUTI, non un "in orario sì/no": la tolleranza è
// configurabile sulla voce di punteggio, quindi cambiandola gli stessi dati
// raccontano una storia diversa senza dover ricalcolare nulla a mano.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const valetId = (req.nextUrl.searchParams.get('valetId') ?? '').trim()
  const [righe, totale] = await Promise.all([
    db.puntualita.findMany({
      where: valetId ? { valetId } : undefined,
      orderBy: { creatoIl: 'desc' },
      take: 300,
    }),
    db.puntualita.count({ where: valetId ? { valetId } : undefined }),
  ])
  return NextResponse.json({ righe, totale })
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    valetId?: string
    valetNome?: string
    ordineNumero?: string
    attesaIl?: string
    consegnataIl?: string
    minutiRitardo?: number
    note?: string
  }

  const valetId = (c.valetId ?? '').trim()
  if (!valetId) {
    return NextResponse.json({ errore: 'Scegli il valet della consegna.' }, { status: 400 })
  }

  const attesa = c.attesaIl ? new Date(c.attesaIl) : null
  const consegnata = c.consegnataIl ? new Date(c.consegnataIl) : null
  const dateValide =
    (!attesa || !Number.isNaN(attesa.getTime())) && (!consegnata || !Number.isNaN(consegnata.getTime()))
  if (!dateValide) {
    return NextResponse.json({ errore: 'Le date non sono valide.' }, { status: 400 })
  }

  // Se ci sono le due date, il ritardo si CALCOLA (niente doppia verità);
  // altrimenti si prende il numero inserito a mano.
  let minutiRitardo: number
  if (attesa && consegnata) {
    minutiRitardo = Math.round((consegnata.getTime() - attesa.getTime()) / 60000)
  } else {
    const m = Number(c.minutiRitardo)
    if (!Number.isFinite(m)) {
      return NextResponse.json(
        { errore: 'Serve il ritardo in minuti, oppure le due date da cui ricavarlo.' },
        { status: 400 }
      )
    }
    minutiRitardo = Math.round(m)
  }

  const dati = {
    valetId,
    valetNome: (c.valetNome ?? '').trim(),
    ordineNumero: (c.ordineNumero ?? '').trim(),
    attesaIl: attesa,
    consegnataIl: consegnata,
    minutiRitardo,
    note: (c.note ?? '').trim(),
  }

  const riga = c.id
    ? await db.puntualita.update({ where: { id: c.id }, data: dati })
    : await db.puntualita.create({ data: dati })
  return NextResponse.json({ riga })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.puntualita.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
