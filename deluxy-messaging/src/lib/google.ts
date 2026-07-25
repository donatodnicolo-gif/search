// Google OAuth server-side (authorization code + refresh token) + People API
// per salvare i contatti degli ordini nella rubrica Google.
//
// Perché server-side e non il token client del browser (come deluxy-anagrafiche):
// qui i contatti vanno salvati anche SENZA un operatore davanti (all'arrivo di
// un ordine, o da un cron di Vercel). Serve quindi un refresh token, che
// teniamo cifrato in Impostazione e con cui coniamo un access token quando serve.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const SCOPE_CONTACTS = 'https://www.googleapis.com/auth/contacts'

/** Il redirect URI da autorizzare nella console Google (deve combaciare esatto). */
export function redirectUri(base: string): string {
  return `${base.replace(/\/$/, '')}/api/google/callback`
}

/** URL della schermata di consenso Google. `state` protegge dal CSRF. */
export function urlConsenso(base: string, clientId: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(base),
    response_type: 'code',
    scope: SCOPE_CONTACTS,
    access_type: 'offline', // necessario per ricevere il refresh_token
    prompt: 'consent', // forza il refresh_token anche ai riaccessi
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

/** Scambia il `code` del callback con i token. Torna il refresh_token da salvare. */
export async function scambiaCodice(
  base: string,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(base),
    }),
  })
  const j = (await res.json().catch(() => ({}))) as {
    refresh_token?: string
    access_token?: string
    error_description?: string
    error?: string
  }
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Scambio codice fallito (HTTP ${res.status})`)
  }
  return { refreshToken: j.refresh_token || '', accessToken: j.access_token }
}

/** Conia un access token a partire dal refresh token salvato. */
export async function accessTokenDaRefresh(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error_description?: string
    error?: string
  }
  if (!res.ok || !j.access_token) {
    throw new Error(
      j.error_description || j.error || `Refresh del token Google fallito (HTTP ${res.status})`
    )
  }
  return j.access_token
}

// Marcatore nella biografia: distingue i contatti creati da noi da quelli
// personali dell'utente. Serve a NON rinominare mai una rubrica altrui.
export const MARCATORE = 'Deluxy Messaggi'

export type ContattoTrovato = {
  resourceName: string
  etag: string
  nome: string
  nostro: boolean // creato da questa app (ha il marcatore in biografia)
}

/** Cerca un contatto per numero di telefono (dedup). */
export async function cercaContattoPerTelefono(
  accessToken: string,
  telefono: string
): Promise<ContattoTrovato | null> {
  const cifre = telefono.replace(/[^\d]/g, '')
  if (cifre.length < 6) return null
  const coda = cifre.slice(-9)
  const auth = { headers: { Authorization: 'Bearer ' + accessToken } }
  // "warm-up": la prima searchContacts dopo un po' può tornare vuota
  await fetch(
    'https://people.googleapis.com/v1/people:searchContacts?query=&readMask=names',
    auth
  ).catch(() => {})
  for (const q of [...new Set([telefono.trim(), cifre, coda])].filter(Boolean)) {
    const r = await fetch(
      'https://people.googleapis.com/v1/people:searchContacts?pageSize=10&readMask=names,phoneNumbers,biographies&query=' +
        encodeURIComponent(q),
      auth
    )
    if (!r.ok) continue
    const results = ((await r.json()).results || []) as {
      person?: {
        resourceName?: string
        etag?: string
        names?: { displayName?: string }[]
        phoneNumbers?: { value?: string }[]
        biographies?: { value?: string }[]
      }
    }[]
    for (const res of results) {
      const p = res.person || {}
      const combacia = (p.phoneNumbers || []).some((x) => {
        const d = String(x.value || '').replace(/[^\d]/g, '')
        return d && (d.endsWith(coda) || coda.endsWith(d.slice(-9)))
      })
      if (combacia && p.resourceName) {
        return {
          resourceName: p.resourceName,
          etag: p.etag ?? '',
          nome: p.names?.[0]?.displayName || 'contatto senza nome',
          nostro: (p.biographies || []).some((b) => (b.value || '').includes(MARCATORE)),
        }
      }
    }
  }
  return null
}

type DatiContatto = {
  nome: string
  telefono?: string
  email?: string
  indirizzo?: string
  note?: string
}

function corpoContatto(c: DatiContatto) {
  return {
    // givenName soltanto: il nome che componiamo è già completo (sigla + nome + ordine)
    names: [{ givenName: c.nome || 'Cliente Deluxy' }],
    phoneNumbers: c.telefono ? [{ value: c.telefono, type: 'mobile' }] : [],
    emailAddresses: c.email ? [{ value: c.email, type: 'home' }] : [],
    addresses: c.indirizzo ? [{ formattedValue: c.indirizzo, type: 'home' }] : [],
    biographies: [{ value: MARCATORE + (c.note ? ' · ' + c.note : '') }],
  }
}

const CAMPI = 'names,phoneNumbers,emailAddresses,addresses,biographies'

/** Crea un contatto nella rubrica Google. */
export async function creaContatto(accessToken: string, c: DatiContatto): Promise<void> {
  const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoContatto(c)),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(j?.error?.message || 'HTTP ' + res.status)
  }
}

/**
 * Aggiorna un contatto già nostro (es. con il numero dell'ordine più recente).
 * L'etag va rifresco: Google rifiuta l'update se il contatto è cambiato nel frattempo.
 */
export async function aggiornaContatto(
  accessToken: string,
  resourceName: string,
  c: DatiContatto
): Promise<void> {
  const auth = { Authorization: 'Bearer ' + accessToken }
  // Rileggiamo il contatto per avere l'etag corrente.
  const letto = await fetch(
    `https://people.googleapis.com/v1/${resourceName}?personFields=${CAMPI}`,
    { headers: auth }
  )
  if (!letto.ok) throw new Error('Contatto non rileggibile: HTTP ' + letto.status)
  const attuale = (await letto.json()) as { etag?: string }

  const res = await fetch(
    `https://people.googleapis.com/v1/${resourceName}:updateContact?updatePersonFields=${CAMPI}`,
    {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ etag: attuale.etag, ...corpoContatto(c) }),
    }
  )
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(j?.error?.message || 'HTTP ' + res.status)
  }
}
