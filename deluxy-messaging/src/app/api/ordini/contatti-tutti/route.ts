import { NextResponse } from 'next/server'
import { salvaContattiOrdini } from '@/lib/contatti'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Salva su Google Contacts i clienti degli ordini non ancora salvati (dedup per
// telefono, un contatto per persona col numero d'ordine più recente).
export async function POST() {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const esito = await salvaContattiOrdini()
  if (!esito.collegato) {
    return NextResponse.json(
      { errore: 'Google Contacts non collegato (Impostazioni → Collega Google).' },
      { status: 400 }
    )
  }
  return NextResponse.json(esito)
}
