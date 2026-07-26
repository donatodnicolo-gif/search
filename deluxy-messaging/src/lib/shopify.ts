// Client Shopify Admin API (GraphQL 2024-10) per scaricare gli ordini dello
// store. Il token (shpat_…) sta cifrato in Impostazione e non lascia il server.
// Pattern allineato a deluxy-partner/src/lib/shopify.ts, con in più i dati di
// contatto (telefono/indirizzo) che ci servono per Google Contacts.

const API_VERSION = '2024-10'

export type OrdineShopify = {
  shopifyId: string
  numero: string
  data: Date
  totale: number
  valuta: string
  statoPagamento: string
  clienteNome: string
  telefono: string
  email: string
  indirizzo: string
  citta: string
  note: string
}

const ORDERS_QUERY = `
query Ordini($cursor: String, $q: String) {
  orders(first: 50, after: $cursor, query: $q, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        displayFinancialStatus
        note
        totalPriceSet { shopMoney { amount currencyCode } }
        shippingAddress { name address1 address2 city zip province country phone }
        customer { firstName lastName phone email }
      }
    }
    pageInfo { hasNextPage }
  }
}`

type OrderNode = {
  id: string
  name: string
  createdAt: string
  displayFinancialStatus: string | null
  note: string | null
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null
  shippingAddress: {
    name: string | null
    address1: string | null
    address2: string | null
    city: string | null
    zip: string | null
    province: string | null
    country: string | null
    phone: string | null
  } | null
  customer: {
    firstName: string | null
    lastName: string | null
    phone: string | null
    email: string | null
  } | null
}

async function shopifyGraphQL(dominio: string, token: string, variables: Record<string, unknown>) {
  const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: ORDERS_QUERY, variables }),
    signal: AbortSignal.timeout(20000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(`token non valido o scaduto (HTTP ${res.status}) — ricollega lo store in Impostazioni`)
  }
  if (!res.ok) {
    throw new Error(`Shopify ${dominio} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`)
  return json.data
}

function componiIndirizzo(a: OrderNode['shippingAddress']): string {
  if (!a) return ''
  return [
    [a.address1, a.address2].filter(Boolean).join(' '),
    [a.zip, a.city].filter(Boolean).join(' '),
    [a.province, a.country].filter(Boolean).join(', '),
  ]
    .filter((r) => r && r.trim())
    .join(', ')
}

/** Scarica gli ordini creati da `dal` in poi (paginato, dal più recente). */
export async function scaricaOrdini(
  dominio: string,
  token: string,
  dal: Date,
  maxPagine = 20
): Promise<OrdineShopify[]> {
  const q = `created_at:>=${dal.toISOString().slice(0, 10)}`
  const out: OrdineShopify[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPagine; page++) {
    const data = await shopifyGraphQL(dominio, token, { cursor, q })
    const edges: { cursor: string; node: OrderNode }[] = data?.orders?.edges ?? []
    for (const { node: n } of edges) {
      const nomeCliente =
        [n.customer?.firstName, n.customer?.lastName].filter(Boolean).join(' ') ||
        n.shippingAddress?.name ||
        ''
      out.push({
        shopifyId: n.id,
        numero: n.name,
        data: new Date(n.createdAt),
        totale: parseFloat(n.totalPriceSet?.shopMoney?.amount ?? '0') || 0,
        valuta: n.totalPriceSet?.shopMoney?.currencyCode ?? 'EUR',
        statoPagamento: n.displayFinancialStatus ?? '',
        clienteNome: nomeCliente,
        telefono: n.customer?.phone || n.shippingAddress?.phone || '',
        email: n.customer?.email || '',
        indirizzo: componiIndirizzo(n.shippingAddress),
        citta: n.shippingAddress?.city ?? '',
        note: n.note?.slice(0, 500) ?? '',
      })
    }
    if (!data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break
    cursor = edges[edges.length - 1].cursor
  }
  return out
}

/**
 * Conia un Admin API token per un'app della Dev Dashboard tramite il "client
 * credentials grant" (Client ID + Secret → token valido ~24h). È il flusso
 * server-to-server per le app moderne, adatto a Vercel/automazione.
 */
export async function tokenDaClientCredentials(
  dominio: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(`https://${dominio}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string
    error_description?: string
    error?: string
  }
  if (!res.ok || !j.access_token) {
    throw new Error(
      j.error_description || j.error || `Grant Shopify fallito (HTTP ${res.status})`
    )
  }
  return j.access_token
}

/**
 * Ricava il token Admin da usare: se c'è un token statico (app legacy, shpat_)
 * usa quello; altrimenti conia col client credentials grant (app Dev Dashboard).
 */
export async function risolviToken(
  config: Record<string, string>
): Promise<{ dominio: string; token: string }> {
  const dominio = (config.shopifyDominio ?? '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!dominio) throw new Error('Shopify: dominio dello store mancante (Impostazioni).')
  if (config.shopifyToken) return { dominio, token: config.shopifyToken }
  if (config.shopifyClientId && config.shopifyClientSecret) {
    const token = await tokenDaClientCredentials(dominio, config.shopifyClientId, config.shopifyClientSecret)
    return { dominio, token }
  }
  throw new Error(
    'Shopify non configurato: serve un Admin API token (shpat_) oppure Client ID + Client Secret (Impostazioni).'
  )
}

/** Verifica dominio+token (pagina Impostazioni): torna il nome dello shop. */
export async function verificaStore(
  dominio: string,
  token: string
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { ok: false, messaggio: `HTTP ${res.status} — token o dominio non validi` }
    const j = await res.json()
    return { ok: true, messaggio: j?.shop?.name ?? dominio }
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message }
  }
}
