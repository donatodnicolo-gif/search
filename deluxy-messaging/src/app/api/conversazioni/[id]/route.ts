import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Togliere una conversazione dall'inbox. Tre gesti, e la differenza conta:
//
//  · ARCHIVIA (PATCH `archiviata`): sparisce dall'elenco e resta dov'è. È quello
//    che serve nel 99% dei casi — la pubblicità, il thread chiuso.
//  · ELIMINA (DELETE): va nel **cestino**, dove resta 30 giorni. Non cancella
//    niente adesso: una conversazione buttata per errore portava con sé il testo
//    delle mail, gli allegati e chi aveva risposto, senza modo di riaverla.
//  · SVUOTA (DELETE `?definitivo=1`): cancella davvero, conversazione **e tutti
//    i suoi messaggi** (`onDelete: Cascade`). Da qui non si torna: la conferma
//    sta davanti al bottone, non qui.
//
// Nessuno dei tre tocca la casella di posta vera: la mail resta sul server IMAP.
// ⚠️ Con «Scarica posta» una mail **eliminata definitivamente rientra**, se è
// ancora nella posta in arrivo e dentro la finestra dello scarico: la dedup
// guarda i messaggi che abbiamo, e quello cancellato non c'è più. Il cestino
// invece regge — la conversazione esiste, è solo da un'altra parte.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const definitivo = req.nextUrl.searchParams.get('definitivo') === '1'
  const c = await db.conversazione.findUnique({
    where: { id },
    select: { id: true, eliminataIl: true, _count: { select: { messaggi: true } } },
  })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  if (definitivo) {
    await db.conversazione.delete({ where: { id } })
    return NextResponse.json({ eliminata: true, messaggi: c._count.messaggi })
  }

  await db.conversazione.update({
    where: { id },
    data: { eliminataIl: new Date(), nonLetti: 0 },
  })
  return NextResponse.json({ nelCestino: true })
}

// Archivia, riporta in inbox, o ripristina dal cestino.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { archiviata, ripristina } = (await req.json().catch(() => ({}))) as {
    archiviata?: boolean
    ripristina?: boolean
  }
  const c = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  if (ripristina) {
    // Dal cestino si torna in posta in arrivo, non in archivio: chi ripristina
    // vuole rivedere quella conversazione, non nasconderla di nuovo.
    const tornata = await db.conversazione.update({
      where: { id },
      data: { eliminataIl: null, archiviata: false },
      select: { id: true, eliminataIl: true },
    })
    return NextResponse.json(tornata)
  }

  const aggiornata = await db.conversazione.update({
    where: { id },
    data: { archiviata: archiviata !== false, nonLetti: 0 },
    select: { id: true, archiviata: true },
  })
  return NextResponse.json(aggiornata)
}
