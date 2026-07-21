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

async function shopifyGraphQL(dominio: string, token: string, variables: Record<string, unknown>) {
  const res = await fetch(`https://${dominio}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: ORDERS_QUERY, variables }),
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
    const data = await shopifyGraphQL(dominio, token, { cursor, q });
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
