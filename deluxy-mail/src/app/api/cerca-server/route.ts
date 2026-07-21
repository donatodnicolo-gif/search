import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { cercaEImporta } from '@/lib/sync'

// POST /api/cerca-server { q } — fa cercare al server IMAP (che vede tutta la
// casella, anche la posta mai scaricata) e IMPORTA le mail trovate: la ricerca
// locale che segue le vede. È una rotta (non una Server Action) così gira in
// background senza bloccare i clic.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const { q } = (await request.json().catch(() => ({}))) as { q?: string }
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ ok: true, importati: 0 })
    }
    const { importati } = await cercaEImporta(userId, q)
    return NextResponse.json({ ok: true, importati })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
