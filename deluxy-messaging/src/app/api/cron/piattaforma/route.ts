import { NextRequest, NextResponse } from 'next/server'
import { sincronizzaConPiattaforma } from '@/lib/sync-piattaforma'
import { chiudiOrdiniInConsegna } from '@/lib/consegne-piattaforma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chiede alla piattaforma consegne quali ordini ha in mano, ogni 15 minuti.
//
// ⚠️ Come gli altri cron: fuori dal middleware di sessione, chiave `CRON_SECRET`.
// La regola e le tre condizioni stanno in `src/lib/sync-piattaforma.ts`.
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json({ errore: 'CRON_SECRET non configurato.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }
  const esito = await sincronizzaConPiattaforma()
  // ⚠️⚠️ E il secondo giro: gli ordini la cui CONSEGNA e partita si chiudono
  // (chiesto dall utente il 31/08/2026). Sono due letture diverse — le vendite
  // dicono a chi e stato proposto, le consegne dicono se e per strada — e la
  // seconda non deve saltare se la prima fallisce: un errore sulle vendite
  // lascerebbe aperti per sempre ordini gia consegnati.
  const consegne = await chiudiOrdiniInConsegna()
  return NextResponse.json({
    ok: !esito.errore && !consegne.errore,
    ...esito,
    consegne,
  })
}
