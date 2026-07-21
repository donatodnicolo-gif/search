import { db } from './db'

// L'autenticazione delle API pubbliche di AI Mail (le rotte /api/v1/*, con cui
// altre app Deluxy o script possono richiamare invio e "punto della situazione").
//
// Chiave unica (env API_TOKEN), inviata come header `x-api-key` o
// `Authorization: Bearer`. Il chiamante indica su quale utente/casella agire
// con l'header `x-utente` (l'email di login dell'utente AI Mail).

export type Autenticato =
  | { ok: true; utenteId: string; email: string }
  | { ok: false; errore: string; status: number }

export async function autenticaApi(req: Request): Promise<Autenticato> {
  const atteso = (process.env.API_TOKEN || '').trim()
  if (!atteso) {
    return { ok: false, errore: 'API non configurata: manca API_TOKEN sul server.', status: 503 }
  }

  const chiave = (
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim()
  if (chiave !== atteso) {
    return { ok: false, errore: 'Non autorizzato: chiave API errata o mancante.', status: 401 }
  }

  const emailUtente = (req.headers.get('x-utente') || '').trim().toLowerCase()
  if (!emailUtente) {
    return { ok: false, errore: 'Manca l’header x-utente (email dell’utente AI Mail).', status: 400 }
  }

  const u = await db.utente.findFirst({
    where: { email: { equals: emailUtente, mode: 'insensitive' }, attivo: true },
    select: { id: true, email: true },
  })
  if (!u) {
    return { ok: false, errore: `Nessun utente AI Mail attivo con email ${emailUtente}.`, status: 404 }
  }

  return { ok: true, utenteId: u.id, email: u.email }
}
