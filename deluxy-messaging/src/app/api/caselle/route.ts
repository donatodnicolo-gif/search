import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Le caselle di posta attive, per la tendina «Da» del pop-up di composizione.
//
// Escono SOLO indirizzo, nome ed etichetta di predefinita: password, host e
// porte restano lato server. Al browser serve sapere da quale casella si scrive,
// non come ci si autentica.
export async function GET() {
  const caselle = await db.casellaEmail.findMany({
    where: { attiva: true },
    orderBy: [{ predefinita: 'desc' }, { indirizzo: 'asc' }],
    select: { id: true, indirizzo: true, nome: true, predefinita: true },
  })
  return NextResponse.json({ caselle })
}
