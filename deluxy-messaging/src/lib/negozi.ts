import { db } from './db'
import { cifra, decifra } from './crypto'
import { risolviToken } from './shopify'

// Gestione dei negozi Shopify collegati (multi-store). Le credenziali (token
// statico e client secret) sono cifrate in colonna e decifrate solo qui.

function decifraSicuro(v: string): string {
  if (!v) return ''
  try {
    return decifra(v)
  } catch {
    return '' // APP_SECRET cambiato: la credenziale va reinserita
  }
}

export type NegozioConCredenziali = {
  id: string
  nome: string
  prefisso: string
  dominio: string
  token: string
  clientId: string
  clientSecret: string
  attivo: boolean
}

/**
 * Sigla del negozio davanti al nome in rubrica: FL (Flowers), CK (Cake),
 * DL (Deluxy). Si deduce da nome+dominio; "Deluxy Flowers" → FL, perché il
 * marchio più specifico vince su "deluxy".
 */
export function prefissoDaNegozio(nome: string, dominio: string, prefisso = ''): string {
  if (prefisso.trim()) return prefisso.trim().toUpperCase()
  const t = `${nome} ${dominio}`.toLowerCase()
  if (/flower|fior/.test(t)) return 'FL'
  if (/cake|pasticc|torta/.test(t)) return 'CK'
  if (/deluxy/.test(t)) return 'DL'
  return (nome.trim().slice(0, 2) || 'XX').toUpperCase()
}

/** Negozi attivi con le credenziali in chiaro, per lo scarico ordini. */
export async function negoziAttivi(): Promise<NegozioConCredenziali[]> {
  const righe = await db.negozioShopify.findMany({ where: { attivo: true }, orderBy: { nome: 'asc' } })
  return righe.map((n) => ({
    id: n.id,
    nome: n.nome,
    prefisso: prefissoDaNegozio(n.nome, n.dominio, n.prefisso),
    dominio: n.dominio,
    token: decifraSicuro(n.token),
    clientId: n.clientId,
    clientSecret: decifraSicuro(n.clientSecret),
    attivo: n.attivo,
  }))
}

/** Ricava il token Admin per un negozio (statico o via client credentials). */
export async function tokenPerNegozio(n: NegozioConCredenziali): Promise<{ dominio: string; token: string }> {
  return risolviToken({
    shopifyDominio: n.dominio,
    shopifyToken: n.token,
    shopifyClientId: n.clientId,
    shopifyClientSecret: n.clientSecret,
  })
}

type DatiNegozio = {
  nome: string
  prefisso?: string
  dominio: string
  token?: string
  clientId?: string
  clientSecret?: string
  attivo?: boolean // se undefined, non si tocca
}

/** Crea o aggiorna un negozio. Token/secret vuoti = non toccare (già salvati). */
export async function salvaNegozio(id: string | null, dati: DatiNegozio): Promise<void> {
  const dominio = dati.dominio.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  const base = {
    nome: dati.nome.trim() || dominio,
    prefisso: (dati.prefisso ?? '').trim().toUpperCase(),
    dominio,
    clientId: (dati.clientId ?? '').trim(),
    ...(dati.attivo === undefined ? {} : { attivo: dati.attivo }),
  }
  const cifrati: { token?: string; clientSecret?: string } = {}
  if (dati.token && dati.token.trim()) cifrati.token = cifra(dati.token.trim())
  if (dati.clientSecret && dati.clientSecret.trim()) cifrati.clientSecret = cifra(dati.clientSecret.trim())

  if (id) {
    await db.negozioShopify.update({ where: { id }, data: { ...base, ...cifrati } })
  } else {
    await db.negozioShopify.create({
      data: { ...base, token: cifrati.token ?? '', clientSecret: cifrati.clientSecret ?? '' },
    })
  }
}

export async function eliminaNegozio(id: string): Promise<void> {
  await db.negozioShopify.delete({ where: { id } })
}

export async function impostaAttivo(id: string, attivo: boolean): Promise<void> {
  await db.negozioShopify.update({ where: { id }, data: { attivo } })
}
