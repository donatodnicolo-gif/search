import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Togliere una conversazione dall'inbox. Due gesti diversi, e la differenza
// conta:
//
//  · ARCHIVIA (PATCH): sparisce dall'elenco e resta nel database. È quello che
//    serve nel 99% dei casi — la pubblicità che non interessa, il thread chiuso.
//    Si può riportare indietro.
//  · ELIMINA (DELETE): cancella la conversazione **e tutti i suoi messaggi**
//    (`onDelete: Cascade`). ⚠️ Non si torna indietro: il testo delle mail, gli
//    allegati registrati e chi aveva risposto se ne vanno con lei. Per questo la
//    conferma sta davanti al bottone, non qui.
//
// Nessuna delle due tocca la casella di posta vera: la mail resta sul server
// IMAP. Cancellare qui vuol dire «non lavorarla in quest'app», non «buttarla».
// ⚠️ Con «Scarica posta» una mail cancellata **rientra**, se è ancora nella
// posta in arrivo della casella e dentro la finestra dei 7 giorni: la dedup
// guarda i messaggi che abbiamo, e quello cancellato non c'è più. Archiviare
// invece regge — la conversazione esiste, torna solo a farsi vedere.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const c = await db.conversazione.findUnique({
    where: { id },
    select: { id: true, _count: { select: { messaggi: true } } },
  })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  await db.conversazione.delete({ where: { id } })
  return NextResponse.json({ eliminata: true, messaggi: c._count.messaggi })
}

// Archivia o riporta in inbox.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { archiviata } = (await req.json().catch(() => ({}))) as { archiviata?: boolean }
  const c = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  const aggiornata = await db.conversazione.update({
    where: { id },
    data: { archiviata: archiviata !== false, nonLetti: 0 },
    select: { id: true, archiviata: true },
  })
  return NextResponse.json(aggiornata)
}
