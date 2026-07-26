import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ISTRUZIONI_INIZIALI } from '@/lib/cs-ai'

export const dynamic = 'force-dynamic'

// Le istruzioni di partenza, senza duplicare quelle già scritte (match sul
// titolo) — come per le casistiche dei reclami e le voci dei punteggi.
export async function POST() {
  const presenti = await db.istruzioneAI.findMany({ select: { titolo: true } })
  const nomi = new Set(presenti.map((i) => i.titolo.toLowerCase()))
  const daAggiungere = ISTRUZIONI_INIZIALI.filter((i) => !nomi.has(i.titolo.toLowerCase()))
  if (daAggiungere.length) {
    await db.istruzioneAI.createMany({ data: daAggiungere.map((i) => ({ ...i })) })
  }
  return NextResponse.json({
    aggiunte: daAggiungere.length,
    saltate: ISTRUZIONI_INIZIALI.length - daAggiungere.length,
  })
}
