import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { normalizzaSlug } from '@/lib/widget-siti'

export const dynamic = 'force-dynamic'

// Apre una sessione di chat per un visitatore del sito (API pubblica).
// Il token casuale è l'unica chiave della conversazione: chi non lo ha
// non può leggerla, e non contiene dati personali.
export async function POST(req: NextRequest) {
  const { nome, sito } = (await req.json().catch(() => ({}))) as { nome?: string; sito?: string }
  const token = crypto.randomBytes(24).toString('hex')

  // Da QUALE SITO arriva la chat, salvato nello stesso campo del numero WhatsApp
  // e dell'account Meta: fa lo stesso mestiere, dice a chi ha scritto il
  // cliente. Senza, le chat dei tre siti finivano tutte in «Senza marchio» e in
  // Inbox non si sapeva se il visitatore stava guardando i fiori o le torte.
  const slugSito = normalizzaSlug(sito ?? '')

  await db.conversazione.create({
    data: {
      canale: 'widget',
      idEsterno: token,
      numeroId: slugSito,
      nome: (nome ?? '').trim().slice(0, 80) || 'Visitatore sito',
    },
  })

  return NextResponse.json({ token })
}
