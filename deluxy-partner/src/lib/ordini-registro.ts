import { categoriaDaGateway, type OrdineNormalizzato } from "./shopify";

// Sorgente ordini: il REGISTRO CENTRALIZZATO Deluxy Orders (deluxy-orders.vercel.app),
// non più l'API Shopify diretta. Deluxy Orders importa da Shopify e le altre app
// leggono via API a chiave. Qui scarichiamo gli ordini (con lo stesso `brand` e
// `orderId` gid usati in FINANCE, così gli ordini esistenti si aggiornano senza
// duplicarsi) e li normalizziamo nella stessa forma della vecchia sync.
//
// Env: ORDERS_URL (default deluxy-orders.vercel.app) + ORDERS_API_KEY (chiave di
// lettura emessa da Deluxy Orders: `npm run chiave -- deluxy-partner-import`).

// Gli ordini ANNULLATI servono a FINANCE, a differenza delle app operative.
// Il registro di default non li serve (un'app che smista ordini non deve
// lavorarne uno annullato), ma qui dietro c'è del denaro da quadrare: rimborsi
// da registrare e incassi realmente avvenuti su ordini poi annullati — un
// ordine annullato resta spesso "PAID". Per questo si chiede `annullati=inclusi`
// e si porta avanti il flag, invece di far sparire silenziosamente gli ordini:
// senza, un ordine già importato e poi annullato non tornerebbe più nella
// risposta e FINANCE se lo terrebbe per valido per sempre.
export type OrdineRegistro = OrdineNormalizzato & {
  brand: string;
  annullato: boolean;
  annullatoIl: Date | null;
};

function baseUrl(): string {
  return (process.env.ORDERS_URL || "https://deluxy-orders.vercel.app").replace(/\/$/, "");
}

export function ordersConfigurato(): boolean {
  return Boolean(process.env.ORDERS_API_KEY);
}

type OrdineApi = {
  brand: string;
  orderId: string;
  numero: string;
  data: string;
  totale: number;
  valuta: string;
  shopify?: {
    financialStatus?: string | null;
    gateway?: string | null;
    note?: string | null;
    annullato?: boolean;
    annullatoIl?: string | null;
  };
  cliente?: { nome?: string | null; email?: string | null };
};

// Scarica dal registro gli ordini dal `dal` in poi (paginati). Se `dal` è null,
// scarica tutto lo storico.
export async function scaricaOrdiniDaRegistro(dal: Date | null, maxPagine = 400): Promise<OrdineRegistro[]> {
  const key = process.env.ORDERS_API_KEY;
  if (!key) throw new Error("ORDERS_API_KEY mancante: configura la chiave del registro Deluxy Orders.");
  const daParam = dal ? `&da=${dal.toISOString().slice(0, 10)}` : "";
  const out: OrdineRegistro[] = [];

  for (let page = 1; page <= maxPagine; page++) {
    // annullati=inclusi: vedi il commento su OrdineRegistro
    const url = `${baseUrl()}/api/v1/ordini?limit=200&annullati=inclusi&page=${page}${daParam}`;
    const res = await fetch(url, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`Deluxy Orders → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = (await res.json()) as { ordini?: OrdineApi[]; pagine?: number };
    const ordini = j.ordini ?? [];
    for (const o of ordini) {
      const gateway = o.shopify?.gateway ?? null;
      out.push({
        brand: o.brand,
        orderId: o.orderId,
        nome: o.numero,
        data: new Date(o.data),
        totale: o.totale,
        valuta: o.valuta ?? "EUR",
        financialStatus: o.shopify?.financialStatus ?? null,
        gateway,
        categoriaPagamento: categoriaDaGateway(gateway ? [gateway] : []),
        clienteNome: o.cliente?.nome ?? null,
        clienteEmail: o.cliente?.email ?? null,
        note: o.shopify?.note?.trim() || null,
        annullato: Boolean(o.shopify?.annullato),
        annullatoIl: o.shopify?.annullatoIl ? new Date(o.shopify.annullatoIl) : null,
      });
    }
    if (ordini.length === 0 || (j.pagine && page >= j.pagine)) break;
  }
  return out;
}
