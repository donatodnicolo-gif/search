import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

// Lista ordini per la pagina Ordini, più se Google è collegato (per abilitare i
// bottoni "Salva contatto").
export async function GET() {
  const [ordini, token] = await Promise.all([
    db.ordine.findMany({ orderBy: { data: 'desc' }, take: 200 }),
    googleAccessToken().catch(() => null),
  ])
  return NextResponse.json({ ordini, googleCollegato: !!token })
}
