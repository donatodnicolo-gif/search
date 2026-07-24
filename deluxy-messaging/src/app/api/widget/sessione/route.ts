import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Apre una sessione di chat per un visitatore del sito (API pubblica).
// Il token casuale è l'unica chiave della conversazione: chi non lo ha
// non può leggerla, e non contiene dati personali.
export async function POST(req: NextRequest) {
  const { nome } = (await req.json().catch(() => ({}))) as { nome?: string }
  const token = crypto.randomBytes(24).toString('hex')

  await db.conversazione.create({
    data: {
      canale: 'widget',
      idEsterno: token,
      nome: (nome ?? '').trim().slice(0, 80) || 'Visitatore sito',
    },
  })

  return NextResponse.json({ token })
}
