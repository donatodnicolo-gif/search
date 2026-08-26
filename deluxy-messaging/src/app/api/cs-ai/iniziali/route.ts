import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ISTRUZIONI_INIZIALI } from '@/lib/cs-ai'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le istruzioni di partenza, senza duplicare quelle già scritte (match sul
// titolo) — come per le casistiche dei reclami e le voci dei punteggi.
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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
