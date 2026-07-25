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
