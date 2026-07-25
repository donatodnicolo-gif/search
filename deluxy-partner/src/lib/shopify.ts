import { prisma } from "./db";

// Client Shopify Admin API (GraphQL 2024-10) per scaricare gli ordini dei
// negozi collegati. Il token (shpat_...) di ogni negozio è salvato in
// NegozioShopify e non lascia mai il server. Sola lettura (read_orders).

const API_VERSION = "2024-10";

export type OrdineNormalizzato = {
  orderId: string;
  nome: string;
  data: Date;
  totale: number;
  valuta: string;
  financialStatus: string | null;
  gateway: string | null;
  categoriaPagamento: "bonifico" | "carta" | "contrassegno" | "altro";
  clienteNome: string | null;
  clienteEmail: string | null;
  note: string | null;
};

// Deduce la categoria di pagamento dai nomi dei gateway Shopify.
export function categoriaDaGateway(gateways: string[]): OrdineNormalizzato["categoriaPagamento"] {
  const g = gateways.join(" ").toLowerCase();
  if (/bonif|bank|transfer|manual|wire|sepa/.test(g)) return "bonifico";
  if (/cod|contrass|cash on delivery|contanti|alla consegna/.test(g)) return "contrassegno";
  if (/shopify_payments|stripe|paypal|card|carta|credit|klarna|scalapay|satispay|amazon/.test(g)) return "carta";
  return "altro";
}

const ORDERS_QUERY = `
query Ordini($cursor: String, $q: String) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        displayFinancialStatus
        note
        paymentGatewayNames
        totalPriceSet { shopMoney { amount currencyCode } }
        customer { firstName lastName email }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  note: string | null;
  paymentGatewayNames: string[];
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { firstName: string | null; lastName: string | null; email: string | null } | null;
};

async function shopifyGraphQL(
  dominio: string,
  token: string,
  query: string,
  variables: Record<string, unknown>
) {
  const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`token non valido o scaduto (HTTP ${res.status}) — ricollega il negozio`);
  }
  if (!res.ok) {
    throw new Error(`Shopify ${dominio} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data;
}

// Scarica gli ordini di un negozio creati da `dal` in poi (paginato).
export async function scaricaOrdini(
  dominio: string,
  token: string,
  dal: Date,
  maxPagine = 40
): Promise<OrdineNormalizzato[]> {
  const q = `created_at:>=${dal.toISOString().slice(0, 10)}`;
  const out: OrdineNormalizzato[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPagine; page++) {
    const data = await shopifyGraphQL(dominio, token, ORDERS_QUERY, { cursor, q });
    const edges: { cursor: string; node: OrderNode }[] = data?.orders?.edges ?? [];
    for (const { node: n } of edges) {
      const gateways = n.paymentGatewayNames ?? [];
      out.push({
        orderId: n.id,
        nome: n.name,
        data: new Date(n.createdAt),
        totale: parseFloat(n.totalPriceSet?.shopMoney?.amount ?? "0") || 0,
        valuta: n.totalPriceSet?.shopMoney?.currencyCode ?? "EUR",
        financialStatus: n.displayFinancialStatus ?? null,
        gateway: gateways.join(", ") || null,
        categoriaPagamento: categoriaDaGateway(gateways),
        clienteNome: [n.customer?.firstName, n.customer?.lastName].filter(Boolean).join(" ") || null,
        clienteEmail: n.customer?.email ?? null,
        note: n.note?.slice(0, 500) ?? null,
      });
    }
    if (!data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }
  return out;
}

// Conia un Admin API token per un'app della Dev Dashboard tramite il "client
// credentials grant" (Client ID + Secret → token valido ~24h). È il flusso
// server-to-server delle app moderne, adatto a Vercel/automazione: nessun
// redirect, nessun token statico da rivelare. Torna il token e i secondi di
// validità.
export async function tokenDaClientCredentials(
  dominio: string,
  clientId: string,
  clientSecret: string
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(`https://${dominio}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Grant Shopify fallito (HTTP ${res.status})`);
  }
  return { token: j.access_token, expiresIn: j.expires_in ?? 86400 };
}

type NegozioAuth = {
  id: string;
  dominio: string;
  token: string;
  clientId: string | null;
  clientSecret: string | null;
  tokenScadeIl: Date | null;
};

// Ritorna un token Admin VALIDO per il negozio, coniandone uno nuovo se serve:
//  - se il negozio ha Client ID + Secret e il token in cache è scaduto (o manca),
//    conia col client credentials grant e salva token+scadenza in DB;
//  - altrimenti usa il token statico salvato.
// Così sync e cron non devono sapere come è autenticato il negozio.
export async function tokenNegozio(neg: NegozioAuth): Promise<string> {
  const usaGrant = Boolean(neg.clientId && neg.clientSecret);
  if (usaGrant) {
    const scaduto = !neg.token || !neg.tokenScadeIl || neg.tokenScadeIl.getTime() < Date.now();
    if (!scaduto) return neg.token;
    const { token, expiresIn } = await tokenDaClientCredentials(neg.dominio, neg.clientId!, neg.clientSecret!);
    // rinnova con un margine di 5 minuti sulla scadenza dichiarata da Shopify
    const scadeIl = new Date(Date.now() + Math.max(60, expiresIn - 300) * 1000);
    await prisma.negozioShopify.update({ where: { id: neg.id }, data: { token, tokenScadeIl: scadeIl } });
    return token;
  }
  if (neg.token) return neg.token;
  throw new Error("nessun token statico né Client ID/Secret configurati");
}

// Verifica che un token legga (per la pagina Impostazioni): torna il nome shop.
export async function verificaNegozio(dominio: string, token: string): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, messaggio: `HTTP ${res.status} — token o dominio non validi` };
    const j = await res.json();
    return { ok: true, messaggio: j?.shop?.name ?? dominio };
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message };
  }
}

export async function negoziAttivi() {
  return prisma.negozioShopify.findMany({ where: { attivo: true }, orderBy: { brand: "asc" } });
}

// ---------- Transazioni di un singolo ordine ----------
// Per gli ordini a carta non c'è un movimento bancario 1:1: il denaro entra su
// Shopify Payments e arriva in banca in un *payout* aggregato. Qui recuperiamo
// le transazioni di pagamento reali dell'ordine (l'incasso sul gateway) e, dove
// disponibile, il payout che le porterà in banca — così si vede "cosa" ha pagato.

const TRANSAZIONI_ORDINE_QUERY = `
query TxOrdine($id: ID!) {
  order(id: $id) {
    id
    name
    transactions(first: 20) {
      id
      kind
      status
      gateway
      processedAt
      accountNumber
      paymentId
      amountSet { shopMoney { amount currencyCode } }
    }
  }
}`;

export type TransazioneOrdine = {
  id: string;
  kind: string | null; // SALE | CAPTURE | AUTHORIZATION | REFUND | VOID...
  status: string | null; // SUCCESS | PENDING | FAILURE | ERROR
  gateway: string | null;
  processedAt: string | null;
  accountNumber: string | null; // ultime cifre carta (se disponibile)
  paymentId: string | null; // riferimento ordine/pagamento del gateway
  importo: number;
  valuta: string;
};

// Scarica le transazioni di un ordine da Shopify (sola lettura). `orderGid` è il
// gid completo (gid://shopify/Order/123...). Ritorna [] se l'ordine non esiste
// più o non ha transazioni.
export async function scaricaTransazioniOrdine(
  dominio: string,
  token: string,
  orderGid: string
): Promise<TransazioneOrdine[]> {
  const data = await shopifyGraphQL(dominio, token, TRANSAZIONI_ORDINE_QUERY, { id: orderGid });
  const tx = data?.order?.transactions ?? [];
  return tx.map(
    (t: {
      id: string;
      kind: string | null;
      status: string | null;
      gateway: string | null;
      processedAt: string | null;
      accountNumber: string | null;
      paymentId: string | null;
      amountSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
    }) => ({
      id: t.id,
      kind: t.kind,
      status: t.status,
      gateway: t.gateway,
      processedAt: t.processedAt,
      accountNumber: t.accountNumber,
      paymentId: t.paymentId,
      importo: parseFloat(t.amountSet?.shopMoney?.amount ?? "0") || 0,
      valuta: t.amountSet?.shopMoney?.currencyCode ?? "EUR",
    })
  );
}
