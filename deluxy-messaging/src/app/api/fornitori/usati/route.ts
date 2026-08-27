import { NextResponse } from 'next/server'
import { fornitoriUsati } from '@/lib/fornitori-usati'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Chi ha preparato che cosa: l'elenco dei fornitori usati, con i loro ordini.
//
// ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA del
// cookie, non che l'utente esista ancora.
export async function GET() {
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  return NextResponse.json(await fornitoriUsati())
}
