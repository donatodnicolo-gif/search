import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Elenco conversazioni per l'inbox (protetto dal middleware di sessione).
export async function GET() {
  const conversazioni = await db.conversazione.findMany({
    where: { archiviata: false },
    orderBy: { ultimoMessaggioIl: 'desc' },
    take: 200,
  })
  return NextResponse.json({ conversazioni })
}
