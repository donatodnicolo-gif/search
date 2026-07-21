import { db } from './db'
import { decifra } from './crypto'

// L'autenticazione delle API pubbliche di AI Mail (le rotte /api/v1/*, con cui
// altre app Deluxy o script possono richiamare invio e "punto della situazione").
//
// Chiave unica, inviata come header `x-api-key` o `Authorization: Bearer`. Il
// chiamante indica su quale utente/casella agire con l'header `x-utente`
// (l'email di login dell'utente AI Mail).
//
// Il token può essere GENERATO dall'app (Impostazioni App, salvato cifrato nel
// DB) oppure impostato come variabile d'ambiente API_TOKEN. Il DB ha la
// precedenza; l'env resta come alternativa.

export const CHIAVE_TOKEN_API = 'api.token'

/** Il token API in vigore e da dove viene (per la UI e per l'auth). */
export async function tokenApiConfigurato(): Promise<{ token: string; fonte: 'app' | 'env' | 'nessuno' }> {
  try {
    const row = await db.impostazione.findUnique({ where: { chiave: CHIAVE_TOKEN_API }, select: { valore: true } })
    if (row?.valore) {
      try {
        const t = decifra(row.valore).trim()
        if (t) return { token: t, fonte: 'app' }
      } catch {
        /* token cifrato illeggibile (APP_SECRET cambiato?): si prova l'env */
      }
    }
  } catch {
    /* tabella non raggiungibile: si usa l'env */
  }
  const env = (process.env.API_TOKEN || '').trim()
  return env ? { token: env, fonte: 'env' } : { token: '', fonte: 'nessuno' }
}

export type Autenticato =
  | { ok: true; utenteId: string; email: string }
  | { ok: false; errore: string; status: number }

export async function autenticaApi(req: Request): Promise<Autenticato> {
  const { token: atteso } = await tokenApiConfigurato()
  if (!atteso) {
    return { ok: false, errore: 'API non configurata: nessun token (generalo in Impostazioni App o imposta API_TOKEN).', status: 503 }
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
