import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { VOCI_INIZIALI } from '@/lib/punteggi'

export const dynamic = 'force-dynamic'

// Crea le voci di partenza (reclami, feedback, puntualità, una variabile a mano
// d'esempio) senza duplicare quelle già presenti: match sul nome, come per le
// casistiche dei reclami.
export async function POST() {
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
