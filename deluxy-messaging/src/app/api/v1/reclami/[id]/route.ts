import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { autentica, erroreApi } from '@/lib/api-auth'
import { etichetteReclami, reclamoPubblico } from '@/lib/reclami-api'

export const dynamic = 'force-dynamic'

// GET /api/v1/reclami/<id> — UN reclamo con il suo filo di messaggi, per le
// altre app (11/09/2026, il CRM: il dettaglio dentro la scheda del cliente).
// Sola lettura: si lavora nel Customer Service, dove il reclamo vive.
type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const { id } = await params
  const r = await db.reclamo.findUnique({ where: { id } })
  if (!r) return erroreApi(404, 'Reclamo non trovato')

  const messaggi = await db.messaggioReclamo.findMany({
    where: { reclamoId: id },
    orderBy: { creatoIl: 'asc' },
  })
  // Una domanda resta aperta finché nessuno le ha risposto: lo dice la riga,
  // così chi legge non deve incrociare gli id per capirlo.
  const risposte = new Set(messaggi.map((m) => m.rispostaA).filter(Boolean))

  return NextResponse.json(
    {
      reclamo: reclamoPubblico(r, messaggi.filter((m) => m.domanda && !risposte.has(m.id)).length),
      messaggi: messaggi.map((m) => ({
        id: m.id,
        autoreNome: m.autoreNome,
        testo: m.testo,
        domanda: m.domanda,
        rispostaA: m.rispostaA,
        senzaRisposta: m.domanda && !risposte.has(m.id),
        creatoIl: m.creatoIl.toISOString(),
      })),
      etichette: etichetteReclami(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
