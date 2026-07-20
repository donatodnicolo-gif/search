// Feed iCal del calendario, in sola lettura. L'autenticazione è il token
// segreto nell'URL (?token=…): è il modello standard dei calendari in
// abbonamento — Google/Apple/Outlook non sanno fare login, sanno leggere URL.
// Il token si genera e si revoca dalla pagina Calendario.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calendarioIcs } from '@/lib/ics'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')?.trim()
  if (!token || token.length < 20) {
    return new NextResponse('Non autorizzato', { status: 401 })
  }

  const utente = await db.utente.findFirst({
    where: { tokenCalendario: token, attivo: true },
    select: { id: true, nome: true },
  })
  if (!utente) return new NextResponse('Non autorizzato', { status: 401 })

  // Tutto il calendario: le agende esterne gestiscono da sole passato e futuro.
  const eventi = await db.evento.findMany({
    where: { utenteId: utente.id },
    orderBy: { inizio: 'asc' },
    take: 1000,
  })

  return new NextResponse(calendarioIcs(eventi, utente.nome), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="deluxy-ai-mail.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
