import { NextRequest, NextResponse } from 'next/server'
import { interrompiGestioneApp } from '@/lib/sync-piattaforma'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// «Questo lo facciamo noi»: l'ordine esce dalle mani della piattaforma.
//
// ⚠️⚠️ Non annulla la proposta dentro la piattaforma — il suo canale app-to-app
// è di sola lettura. Quello che fa (e quello che NON fa) torna nel messaggio,
// perché chi preme deve sapere se il partner sta ancora guardando quella
// proposta: vedi `interrompiGestioneApp`.
export async function POST(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const esito = await interrompiGestioneApp(id)
  return NextResponse.json(esito, { status: esito.ok ? 200 : 404 })
}
