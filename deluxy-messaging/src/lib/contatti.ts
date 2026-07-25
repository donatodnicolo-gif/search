import { leggiImpostazioni } from './impostazioni'
import { accessTokenDaRefresh, cercaContattoPerTelefono, creaContatto } from './google'

// Colla fra gli ordini e Google Contacts: legge le credenziali salvate,
// conia un access token e salva il contatto di un ordine (con dedup per telefono).

/** Access token Google dai settaggi salvati; `null` se Google non è collegato. */
export async function googleAccessToken(): Promise<string | null> {
  const c = await leggiImpostazioni(['googleClientId', 'googleClientSecret', 'googleRefreshToken'])
  if (!c.googleClientId || !c.googleClientSecret || !c.googleRefreshToken) return null
  return accessTokenDaRefresh(c.googleClientId, c.googleClientSecret, c.googleRefreshToken)
}

export type EsitoContatto = { fase: 'presente' | 'aggiunto'; testo: string }

/** Salva il contatto di un ordine, saltando se il telefono è già in rubrica. */
export async function salvaContatto(
  accessToken: string,
  ordine: {
    clienteNome: string
    telefono: string
    email: string
    indirizzo: string
    numero: string
  }
): Promise<EsitoContatto> {
  if (ordine.telefono) {
    const esistente = await cercaContattoPerTelefono(accessToken, ordine.telefono)
    if (esistente) return { fase: 'presente', testo: `Già in rubrica: ${esistente}` }
  }
  await creaContatto(accessToken, {
    nome: ordine.clienteNome,
    telefono: ordine.telefono,
    email: ordine.email,
    indirizzo: ordine.indirizzo,
    note: `ordine ${ordine.numero}`.trim(),
  })
  return { fase: 'aggiunto', testo: 'Aggiunto a Google Contacts' }
}
