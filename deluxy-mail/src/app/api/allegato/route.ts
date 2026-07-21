import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { leggiAllegato } from '@/lib/imap'

// GET /api/allegato?messaggio=<id>&i=<indice>
// Scarica ON-DEMAND un allegato dal server e lo serve. Autenticato dal cookie:
// il messaggio dev'essere dell'utente loggato.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) return new Response('Sessione scaduta', { status: 401 })

  const url = new URL(req.url)
  const messaggioId = url.searchParams.get('messaggio') || ''
  const indice = Number(url.searchParams.get('i') || '0')
  if (!messaggioId || Number.isNaN(indice)) return new Response('Parametri mancanti', { status: 400 })

  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId: userId },
    include: { account: true },
  })
  if (!m || m.uid <= 0) return new Response('Allegato non disponibile', { status: 404 })

  const cartella = m.direzione === 'uscita' ? m.account.cartellaInviata || undefined : m.account.cartella
  let allegato
  try {
    allegato = await leggiAllegato(m.account, m.uid, indice, cartella)
  } catch {
    return new Response('Errore nel recupero dal server', { status: 502 })
  }
  if (!allegato) return new Response('Allegato non trovato', { status: 404 })

  // Nome file "sicuro" nell'header (niente a-capo/virgolette), + versione UTF-8.
  const nomeAscii = allegato.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return new Response(new Uint8Array(allegato.contenuto), {
    headers: {
      'Content-Type': allegato.tipo,
      'Content-Disposition': `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(allegato.nome)}`,
      'Cache-Control': 'no-store',
    },
  })
}
