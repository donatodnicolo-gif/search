import { Prisma } from "@prisma/client";

// Costruzione del filtro Prisma degli ordini, condivisa tra la UI (elenco) e le
// API di lettura, così i due percorsi filtrano allo stesso modo.
// Parametri accettati: q (ricerca a parole), brand, stato (chiave), categoria
// (di pagamento), app (destinazione), etichetta (nome), da/a (date ISO).
// I campi in cui cerca una singola parola. Include l'ordine (anche senza "#"),
// il cliente (nome, email, telefono), il destinatario e l'indirizzo completo, i
// prodotti (titolo, variante, SKU), le note e i tag Shopify, e la
// classificazione Deluxy (fornitore, responsabile, note interne, etichette).
function campiRicerca(parola: string): Prisma.OrdineWhereInput[] {
  const c = { contains: parola, mode: "insensitive" as const };
  // "#1234" e "1234" devono trovare lo stesso ordine
  const senzaCancelletto = parola.replace(/^#/, "");
  return [
    { numero: c },
    { numero: { contains: senzaCancelletto, mode: "insensitive" } },
    { clienteNome: c },
    { clienteEmail: c },
    { clienteTelefono: c },
    { spedizioneNome: c },
    { indirizzo: c },
    { citta: c },
    { cap: c },
    { provincia: c },
    { paese: c },
    { brand: c },
    { fasciaConsegna: c },
    { noteShopify: c },
    { tagShopify: c },
    { gateway: c },
    // classificazione Deluxy
    { fornitore: c },
    { responsabile: c },
    { tipoConsegna: c },
    { tipoProdotto: c },
    { canale: c },
    { noteInterne: c },
    { etichette: { some: { nome: c } } },
    // prodotti dell'ordine
    {
      righe: {
        some: {
          OR: [{ titolo: c }, { variante: c }, { sku: c }],
        },
      },
    },
  ];
}

export function whereOrdini(p: URLSearchParams): Prisma.OrdineWhereInput {
  const where: Prisma.OrdineWhereInput = {};
  const and: Prisma.OrdineWhereInput[] = [];

  const q = p.get("q")?.trim();
  if (q) {
    // Ricerca a parole: ogni parola deve comparire in ALMENO uno dei campi
    // (AND fra le parole, OR fra i campi). Così "rossi milano" trova gli ordini
    // di Rossi a Milano, e l'ordine si trova sia come "#1234" sia come "1234".
    for (const parola of q.split(/\s+/).filter(Boolean)) {
      and.push({ OR: campiRicerca(parola) });
    }
  }

  const brand = p.get("brand")?.trim();
  if (brand) where.brand = brand;

  const stato = p.get("stato")?.trim();
  if (stato) where.stato = { chiave: stato };

  const categoria = p.get("categoria")?.trim();
  if (categoria) where.categoriaPagamento = categoria;

  const app = p.get("app")?.trim();
  if (app) where.assegnatoApp = app;

  const etichetta = p.get("etichetta")?.trim();
  if (etichetta) where.etichette = { some: { nome: etichetta } };

  // Stato lato Shopify. Gli annullati sono la distinzione che conta di più:
  // di norma NON si vogliono vedere insieme agli ordini validi.
  const shopify = p.get("shopify")?.trim();
  if (shopify === "annullati") where.annullatoIl = { not: null };
  else if (shopify === "validi") where.annullatoIl = null;
  else if (shopify === "da_evadere") {
    where.annullatoIl = null;
    where.fulfillmentStatus = { in: ["UNFULFILLED", "PARTIALLY_FULFILLED", "ON_HOLD", "SCHEDULED"] };
  } else if (shopify === "evasi") {
    where.fulfillmentStatus = "FULFILLED";
  } else if (shopify === "rimborsati") {
    where.financialStatus = { in: ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"] };
  }

  // Stato del pagamento preciso (codice Shopify): PAID, PENDING, REFUNDED…
  const pagamento = p.get("pagamento")?.trim();
  if (pagamento) where.financialStatus = pagamento;

  // Rischio frode: "sospetti" = medio o alto, quelli da guardare a mano.
  const rischio = p.get("rischio")?.trim();
  if (rischio === "sospetti") where.rischioLivello = { in: ["MEDIUM", "HIGH"] };
  else if (rischio) where.rischioLivello = rischio;

  const da = p.get("da")?.trim();
  const a = p.get("a")?.trim();
  if (da || a) {
    const dataFiltro: Prisma.DateTimeFilter = {};
    if (da) dataFiltro.gte = new Date(da);
    if (a) dataFiltro.lte = new Date(`${a}T23:59:59`);
    where.data = dataFiltro;
  }

  // Filtro sulla data di CONSEGNA richiesta (consegnaDa / consegnaA), utile per
  // sapere cosa esce oggi o domani.
  const cDa = p.get("consegnaDa")?.trim();
  const cA = p.get("consegnaA")?.trim();
  if (cDa || cA) {
    const filtro: Prisma.DateTimeFilter = {};
    if (cDa) filtro.gte = new Date(`${cDa}T00:00:00Z`);
    if (cA) filtro.lte = new Date(`${cA}T23:59:59Z`);
    where.dataConsegna = filtro;
  }

  if (and.length) where.AND = and;
  return where;
}

// Ordine completo (con relazioni) da serializzare per le API.
export const INCLUDE_ORDINE = {
  stato: true,
  etichette: true,
  righe: true,
  negozio: { select: { brand: true, dominio: true } },
} as const;

type OrdineConRelazioni = Prisma.OrdineGetPayload<{ include: typeof INCLUDE_ORDINE }>;

// Serializza un ordine per le API pubbliche (forma stabile e documentata).
export function serializzaOrdine(o: OrdineConRelazioni) {
  return {
    id: o.id,
    brand: o.brand,
    orderId: o.orderId,
    numero: o.numero,
    data: o.data.toISOString(),
    totale: o.totale,
    valuta: o.valuta,
    shopify: {
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      annullato: Boolean(o.annullatoIl),
      annullatoIl: o.annullatoIl?.toISOString() ?? null,
      motivoAnnullamento: o.motivoAnnullamento,
      chiusoIl: o.chiusoIl?.toISOString() ?? null,
      rischio: {
        livello: o.rischioLivello,
        raccomandazione: o.rischioRaccomandazione,
        motivi: o.rischioMotivi ? o.rischioMotivi.split("\n").filter(Boolean) : [],
      },
      gateway: o.gateway,
      note: o.noteShopify,
      tags: o.tagShopify ? o.tagShopify.split(", ").filter(Boolean) : [],
    },
    cliente: {
      nome: o.clienteNome,
      email: o.clienteEmail,
      telefono: o.clienteTelefono,
    },
    // consegna richiesta dal cliente (attributi Shopify)
    consegna: {
      data: o.dataConsegna ? o.dataConsegna.toISOString().slice(0, 10) : null,
      fascia: o.fasciaConsegna,
    },
    biglietto: o.biglietto,
    spedizione: {
      nome: o.spedizioneNome,
      indirizzo: o.indirizzo,
      citta: o.citta,
      cap: o.cap,
      provincia: o.provincia,
      paese: o.paese,
    },
    righe: o.righe.map((r) => ({
      titolo: r.titolo,
      variante: r.variante,
      sku: r.sku,
      quantita: r.quantita,
      prezzo: r.prezzo,
      proprieta: r.proprieta ? r.proprieta.split("\n").filter(Boolean) : [],
    })),
    // Classificazione Deluxy
    classificazione: {
      stato: o.stato ? { chiave: o.stato.chiave, nome: o.stato.nome, terminale: o.stato.terminale } : null,
      etichette: o.etichette.map((e) => e.nome),
      categoriaPagamento: o.categoriaPagamento,
      tipoConsegna: o.tipoConsegna,
      tipoProdotto: o.tipoProdotto,
      canale: o.canale,
      assegnatoApp: o.assegnatoApp,
      fornitore: o.fornitore,
      responsabile: o.responsabile,
      classificazioni: o.classificazioni ?? null,
      noteInterne: o.noteInterne,
      ultimaClassifica: o.ultimaClassifica?.toISOString() ?? null,
    },
    updatedAt: o.updatedAt.toISOString(),
  };
}

// Formattazione importo per la UI.
export function euro(n: number, valuta = "EUR"): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: valuta }).format(n);
}

// ---------- Stati Shopify in italiano ----------
// I codici dell'API sono in inglese e maiuscoli: qui diventano leggibili.
const EVASIONE: Record<string, string> = {
  FULFILLED: "evaso",
  UNFULFILLED: "da evadere",
  PARTIALLY_FULFILLED: "evaso in parte",
  SCHEDULED: "programmato",
  ON_HOLD: "in attesa",
  IN_PROGRESS: "in lavorazione",
  OPEN: "aperto",
  PENDING_FULFILLMENT: "da evadere",
  RESTOCKED: "rimesso a magazzino",
};

const PAGAMENTO: Record<string, string> = {
  PAID: "pagato",
  PENDING: "in attesa",
  PARTIALLY_PAID: "pagato in parte",
  PARTIALLY_REFUNDED: "rimborsato in parte",
  REFUNDED: "rimborsato",
  VOIDED: "annullato",
  AUTHORIZED: "autorizzato",
  EXPIRED: "scaduto",
  UNPAID: "non pagato",
};

const MOTIVI: Record<string, string> = {
  CUSTOMER: "richiesta del cliente",
  DECLINED: "pagamento rifiutato",
  FRAUD: "sospetta frode",
  INVENTORY: "merce non disponibile",
  STAFF: "errore interno",
  OTHER: "altro",
};

export function evasioneLeggibile(s: string | null): string | null {
  if (!s) return null;
  return EVASIONE[s] ?? s.toLowerCase().replace(/_/g, " ");
}

export function pagamentoLeggibile(s: string | null): string | null {
  if (!s) return null;
  return PAGAMENTO[s] ?? s.toLowerCase().replace(/_/g, " ");
}

export function motivoLeggibile(s: string | null): string | null {
  if (!s) return null;
  return MOTIVI[s] ?? s.toLowerCase().replace(/_/g, " ");
}

const RISCHIO: Record<string, string> = {
  NONE: "nessun rischio",
  LOW: "rischio basso",
  MEDIUM: "rischio medio",
  HIGH: "rischio alto",
};

export function rischioLeggibile(s: string | null): string | null {
  if (!s) return null;
  return RISCHIO[s] ?? s.toLowerCase();
}

// Solo medio e alto meritano di essere segnalati: "basso" è la norma e
// riempirebbe l'elenco di avvisi che nessuno guarderebbe più.
export function rischioDaSegnalare(s: string | null): boolean {
  return s === "MEDIUM" || s === "HIGH";
}

export function coloreRischio(s: string | null): string | undefined {
  if (s === "HIGH") return "var(--red)";
  if (s === "MEDIUM") return "var(--orange)";
  return undefined;
}

// I codici usati nei menu dei filtri, con l'etichetta italiana.
export const STATI_PAGAMENTO = Object.entries(PAGAMENTO).map(([codice, nome]) => ({ codice, nome }));
export const STATI_EVASIONE = Object.entries(EVASIONE).map(([codice, nome]) => ({ codice, nome }));

// Colore dello stato di pagamento: rimborsi e annullamenti in evidenza.
export function colorePagamento(s: string | null): string | undefined {
  if (s === "PAID") return "var(--green)";
  if (s === "REFUNDED" || s === "VOIDED") return "var(--red)";
  if (s === "PARTIALLY_REFUNDED" || s === "PENDING" || s === "PARTIALLY_PAID") return "var(--orange)";
  return undefined;
}

// Il colore dell'evasione: evaso verde, da evadere neutro, parziale arancio.
export function coloreEvasione(s: string | null): string | undefined {
  if (s === "FULFILLED") return "var(--green)";
  if (s === "PARTIALLY_FULFILLED" || s === "ON_HOLD") return "var(--orange)";
  return undefined;
}

// Link all'ordine nell'admin di Shopify: "gid://shopify/Order/17943253975370"
// + "deluxygifts.myshopify.com" → admin.shopify.com/store/deluxygifts/orders/17943253975370
export function linkShopify(dominio: string | null | undefined, orderId: string): string | null {
  if (!dominio) return null;
  const negozio = dominio.replace(/\.myshopify\.com$/i, "").trim();
  const numerico = orderId.split("/").pop();
  if (!negozio || !numerico || !/^\d+$/.test(numerico)) return null;
  return `https://admin.shopify.com/store/${negozio}/orders/${numerico}`;
}

// La consegna richiesta, pronta da mostrare: "gio 30 lug · 16-20".
// Le date di consegna sono giorni di calendario salvati a mezzogiorno UTC:
// si formattano in UTC, altrimenti col fuso possono scivolare di un giorno.
export function consegnaBreve(data: Date | null, fascia: string | null): string | null {
  if (!data && !fascia) return null;
  if (!data) return fascia;
  const giorno = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(data);
  return fascia ? `${giorno} · ${fascia}` : giorno;
}

// Quanto manca alla consegna, per evidenziare l'urgenza: oggi, domani, passata.
export function urgenzaConsegna(data: Date | null): "passata" | "oggi" | "domani" | "futura" | null {
  if (!data) return null;
  const oggi = new Date();
  const g = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((g(data) - Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())) / 86400000);
  if (diff < 0) return "passata";
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  return "futura";
}

export function dataBreve(d: Date): string {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "2-digit" }).format(d);
}
