import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le caselle di posta attive, per la tendina «Da» del pop-up di composizione.
//
// Escono SOLO indirizzo, nome ed etichetta di predefinita: password, host e
// porte restano lato server. Al browser serve sapere da quale casella si scrive,
// non come ci si autentica.
export async function GET() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const caselle = await db.casellaEmail.findMany({
    where: { attiva: true },
    orderBy: [{ predefinita: 'desc' }, { indirizzo: 'asc' }],
    select: { id: true, indirizzo: true, nome: true, predefinita: true },
  })
  return NextResponse.json({ caselle })
}
