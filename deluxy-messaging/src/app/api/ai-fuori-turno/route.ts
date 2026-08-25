import { NextRequest, NextResponse } from 'next/server'
import { chiEInTurno, giroAiFuoriTurno } from '@/lib/ai-fuori-turno'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La stessa cosa del cron, ma da dentro l'app (quindi da loggati).
//
//   GET  /api/ai-fuori-turno            → chi è in turno adesso
//   POST /api/ai-fuori-turno?prova=1    → fa il giro SENZA mandare niente
//   POST /api/ai-fuori-turno            → fa il giro per davvero
//
// ⚠️⚠️ La PROVA esiste perché questa è l'unica funzione che parla ai clienti da
// sola: prima di accenderla si guarda cosa farebbe, riga per riga, senza che
// nessuno riceva niente. E si riguarda ogni volta che si cambiano gli script.

export async function GET() {
  const inTurno = await chiEInTurno()
  return NextResponse.json({
    inTurno,
    // ⚠️ Si dice anche quando NON c'è nessuno: «[]» a schermo si legge come un
    // errore di caricamento, «nessuno in turno» no.
    nota: inTurno.length ? `In turno adesso: ${inTurno.join(', ')}.` : 'Adesso non è in turno nessuno.',
  })
}

export async function POST(req: NextRequest) {
  const prova = req.nextUrl.searchParams.get('prova') === '1'
  const esito = await giroAiFuoriTurno({ prova })
  return NextResponse.json({ ok: true, prova, ...esito })
}
