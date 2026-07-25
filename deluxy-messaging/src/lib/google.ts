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

/** Cerca un contatto per numero di telefono (dedup). Torna il nome se esiste. */
export async function cercaContattoPerTelefono(
  accessToken: string,
  telefono: string
): Promise<string | null> {
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
      'https://people.googleapis.com/v1/people:searchContacts?pageSize=10&readMask=names,phoneNumbers&query=' +
        encodeURIComponent(q),
      auth
    )
    if (!r.ok) continue
    const results = ((await r.json()).results || []) as {
      person?: { names?: { displayName?: string }[]; phoneNumbers?: { value?: string }[] }
    }[]
    for (const res of results) {
      const p = res.person || {}
      const combacia = (p.phoneNumbers || []).some((x) => {
        const d = String(x.value || '').replace(/[^\d]/g, '')
        return d && (d.endsWith(coda) || coda.endsWith(d.slice(-9)))
      })
      if (combacia) return p.names?.[0]?.displayName || 'contatto senza nome'
    }
  }
  return null
}

/** Crea un contatto nella rubrica Google. */
export async function creaContatto(
  accessToken: string,
  c: { nome: string; telefono?: string; email?: string; indirizzo?: string; note?: string }
): Promise<void> {
  const body = {
    names: [{ givenName: c.nome || 'Cliente Deluxy' }],
    phoneNumbers: c.telefono ? [{ value: c.telefono, type: 'mobile' }] : [],
    emailAddresses: c.email ? [{ value: c.email, type: 'home' }] : [],
    addresses: c.indirizzo ? [{ formattedValue: c.indirizzo, type: 'home' }] : [],
    biographies: [{ value: 'Deluxy Messaggi' + (c.note ? ' · ' + c.note : '') }],
  }
  const res = await fetch('https://people.googleapis.com/v1/people:createContact', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(j?.error?.message || 'HTTP ' + res.status)
  }
}
