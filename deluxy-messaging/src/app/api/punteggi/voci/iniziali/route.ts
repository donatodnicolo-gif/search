import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { VOCI_INIZIALI } from '@/lib/punteggi'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Crea le voci di partenza (reclami, feedback, puntualità, una variabile a mano
// d'esempio) senza duplicare quelle già presenti: match sul nome, come per le
// casistiche dei reclami.
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const presenti = await db.vocePunteggio.findMany({ select: { nome: true } })
  const nomi = new Set(presenti.map((v) => v.nome.toLowerCase()))
  const daAggiungere = VOCI_INIZIALI.filter((v) => !nomi.has(v.nome.toLowerCase()))
  if (daAggiungere.length) {
    await db.vocePunteggio.createMany({ data: daAggiungere.map((v) => ({ ...v })) })
  }
  return NextResponse.json({
    aggiunte: daAggiungere.length,
    saltate: VOCI_INIZIALI.length - daAggiungere.length,
  })
}
