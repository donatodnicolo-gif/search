import { db } from '@/lib/db'
import { decifra } from '@/lib/crypto'

// Il token di un negozio Shopify e una chiamata GraphQL, in un posto solo.
//
// ⚠️ Il segreto sta CIFRATO nella tabella dei negozi: si decifra qui e non si
// ricopia altrove. Una funzione crittografica ricopiata è una che un giorno
// resta indietro — e nel frattempo nessuno se ne accorge, perché continua a
// funzionare fin quando non cambia la chiave.

type NegozioAuth = {
  id: string
  nome: string
  dominio: string
  clientId: string
  clientSecret: string
}

/** Il negozio e un token valido, o `null` se non si può parlare con Shopify. */
export async function negozioConToken(
  negozioId: string
): Promise<{ negozio: NegozioAuth; token: string } | null> {
  const n = await db.negozioShopify.findUnique({
    where: { id: negozioId },
    select: { id: true, nome: true, dominio: true, clientId: true, clientSecret: true },
  })
  if (!n || !n.clientId || !n.clientSecret) return null
  try {
    const res = await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: n.clientId,
        client_secret: decifra(n.clientSecret),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json().catch(() => ({}))) as { access_token?: string }
    return j.access_token ? { negozio: n, token: j.access_token } : null
  } catch {
    return null
  }
}

/** Una chiamata all'Admin API di quel negozio. Non lancia: torna quello che c'è. */
export async function graphqlNegozio<T>(
  negozio: { dominio: string },
  token: string,
  query: string,
  variables?: unknown
): Promise<T> {
  const res = await fetch(`https://${negozio.dominio}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  })
  return (await res.json().catch(() => ({}))) as T
}
