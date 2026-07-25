import { NextResponse } from 'next/server'
import { salvaContattiOrdini } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

// Salva su Google Contacts i clienti degli ordini non ancora salvati (dedup per
// telefono, un contatto per persona col numero d'ordine più recente).
export async function POST() {
  const esito = await salvaContattiOrdini()
  if (!esito.collegato) {
    return NextResponse.json(
      { errore: 'Google Contacts non collegato (Impostazioni → Collega Google).' },
      { status: 400 }
    )
  }
  return NextResponse.json(esito)
}
