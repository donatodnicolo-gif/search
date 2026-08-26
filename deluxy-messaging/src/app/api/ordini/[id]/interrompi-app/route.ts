import { NextRequest, NextResponse } from 'next/server'
import { interrompiGestioneApp } from '@/lib/sync-piattaforma'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// «Questo lo facciamo noi»: l'ordine esce dalle mani della piattaforma.
//
// ⚠️⚠️ Non annulla la proposta dentro la piattaforma — il suo canale app-to-app
// è di sola lettura. Quello che fa (e quello che NON fa) torna nel messaggio,
// perché chi preme deve sapere se il partner sta ancora guardando quella
// proposta: vedi `interrompiGestioneApp`.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const esito = await interrompiGestioneApp(id)
  return NextResponse.json(esito, { status: esito.ok ? 200 : 404 })
}
