import { chiaveApp } from "./chiavi-app";

// Il client verso Deluxy Orders: la FONTE dei clienti, degli ordini e delle
// ricorrenze (standard §7 — il CRM non ne tiene copie, le legge da qui).
// Cache in memoria con TTL breve per non ripetere le stesse chiamate a ogni
// render; timeout su ogni chiamata: una pagina non resta appesa per Orders.

const BASE_DEFAULT = "https://deluxy-orders.vercel.app";
const TTL_MS = 60 * 1000;
const TIMEOUT_MS = 9000;

function base(): string {
  return (process.env.ORDERS_URL ?? BASE_DEFAULT).trim().replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Tipi delle risposte di /api/v1 (mappa 1:1 di ciò che Orders serializza).

export type RiepilogoAI = {
  riassunto: string;
  gusti: string;
  punti?: string[];
  ordiniConsiderati: number;
  aggiornato: boolean;
  ordiniNuoviDaAllora: number;
  aggiornatoIl: string;
  modello: string;
} | null;

export type ClienteRiga = {
  cliente: string; // base64url della chiave: è l'id che viaggia negli URL
  nome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ordini: number;
  speso: number;
  ordineMedio: number;
  ultimoOrdine: string | null;
  giorniDallUltimo: number | null;
  brand: string[];
  segmento: string;
  tipologia: string | null;
  acquisizione?: { canale: string | null; primoOrdine: string | null };
  riepilogo: RiepilogoAI;
};

// I consensi del cliente, come li tiene Orders (PrivacyCliente): "si" | "no"
// | null = mai detto. Arrivano nella scheda dal 10/09/2026.
export type PrivacyCliente = {
  email: string | null;
  sms: string | null;
  telefono: string | null;
  bloccato: boolean;
  note: string | null;
};

export type SchedaCliente = ClienteRiga & {
  annullati: number;
  primoOrdine: string | null;
  tipologiaManuale: boolean;
  privacy?: PrivacyCliente;
};

export type ElencoClienti = {
  totale: number;
  page: number;
  limit: number;
  pagine: number;
  lista: string | null;
  riepiloghiScritti: number;
  clienti: ClienteRiga[];
};

export type ListaClienti = {
  chiave: string;
  nome: string;
  famiglia: string;
  criterio: string;
  consiglio: string;
  clienti: number;
  speso: number;
};

export type CatalogoListe = {
  soglie: Record<string, number>;
  famiglie: { chiave: string; nome: string }[] | Record<string, string>;
  liste: ListaClienti[];
};

export type RigaOrdine = {
  titolo: string;
  variante: string | null;
  sku: string | null;
  quantita: number;
  prezzo: number;
  proprieta: string[];
  immagine: string | null;
};

export type OrdineCliente = {
  id: string;
  brand: string;
  numero: string;
  data: string;
  totale: number;
  valuta: string;
  shopify: { financialStatus: string | null; fulfillmentStatus: string | null; annullato: boolean };
  cliente: { nome: string | null; email: string | null; telefono: string | null };
  consegna: { data: string | null; fascia: string | null } | null;
  biglietto: string | null;
  spedizione: {
    nome: string | null;
    indirizzo: string | null;
    citta: string | null;
    cap: string | null;
    provincia: string | null;
    paese: string | null;
  } | null;
  mittente: { nome: string | null; citta: string | null; paese: string | null; daLontano: boolean } | null;
  righe: RigaOrdine[];
  classificazione?: { tipoProdotto: string | null; tipoConsegna: string | null };
};

export type OrdiniCliente = {
  totale: number;
  page: number;
  limit: number;
  pagine: number;
  annullatiInclusi: boolean;
  ordini: OrdineCliente[];
};

export type RicorrenzaCliente = {
  id: string;
  cliente: string;
  clienteNome: string;
  clienteEmail: string | null;
  // I siti da cui il cliente compra (dal più recente). Arriva da Orders dal
  // 10/09/2026: finché quella versione non è in produzione il campo manca.
  brand?: string[];
  giorno: number;
  mese: number;
  fraGiorni: number;
  destinatario: string;
  citta: string;
  titolo: string;
  tipo: string;
  delicato: boolean;
  ricorrenze: number;
  primoAnno: number;
  ultimoAnno: number;
  ordini: string[];
  ultimaSpesa: number;
  origine: string;
  stato: string;
  note: string | null;
  // Come è stato deciso il tipo (da Orders dall'11/09): "" | parole | ai | manuale.
  tipoDa?: string;
  motivoTipo?: string | null;
  prova?: string | null;
  aggiornatoIl?: string;
};

export type ElencoRicorrenze = {
  totale: number;
  page: number;
  limit: number;
  pagine: number;
  eventi: RicorrenzaCliente[];
};

// Ogni lettura torna così: o i dati, o un errore leggibile da mettere in
// pagina. Mai un throw che butta giù la vista.
export type Esito<T> = { ok: true; dati: T } | { ok: false; errore: string };

// ---------------------------------------------------------------------------

const cache = new Map<string, { dati: unknown; scade: number }>();

async function leggi<T>(percorso: string, ttlMs = TTL_MS): Promise<Esito<T>> {
  const inCache = cache.get(percorso);
  if (inCache && inCache.scade > Date.now()) return { ok: true, dati: inCache.dati as T };

  const chiave = await chiaveApp("ORDERS_API_KEY");
  if (!chiave) {
    return { ok: false, errore: "Manca ORDERS_API_KEY: senza la chiave di Orders il CRM non vede i clienti." };
  }

  try {
    const res = await fetch(`${base()}${percorso}`, {
      headers: { "x-api-key": chiave, "X-App": "deluxy-crm" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 404) {
      const corpo = (await res.json().catch(() => null)) as { errore?: string } | null;
      return { ok: false, errore: corpo?.errore ?? "Non trovato in Orders." };
    }
    if (!res.ok) return { ok: false, errore: `Orders risponde ${res.status}: riprova fra poco.` };
    const dati = (await res.json()) as T;
    cache.set(percorso, { dati, scade: Date.now() + ttlMs });
    return { ok: true, dati };
  } catch {
    return { ok: false, errore: "Orders non risponde (timeout o rete): riprova fra poco." };
  }
}

export async function elencoClienti(p: {
  q?: string;
  lista?: string;
  ordina?: string;
  verso?: string;
  page?: number;
  limit?: number;
}): Promise<Esito<ElencoClienti>> {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.lista) qs.set("lista", p.lista);
  if (p.ordina) qs.set("ordina", p.ordina);
  if (p.verso) qs.set("verso", p.verso);
  qs.set("page", String(p.page ?? 1));
  qs.set("limit", String(p.limit ?? 50));
  return leggi<ElencoClienti>(`/api/v1/clienti?${qs}`);
}

export async function schedaCliente(codice: string): Promise<Esito<SchedaCliente>> {
  return leggi<SchedaCliente>(`/api/v1/clienti/${encodeURIComponent(codice)}`);
}

export async function ordiniCliente(codice: string, page = 1, limit = 50): Promise<Esito<OrdiniCliente>> {
  return leggi<OrdiniCliente>(`/api/v1/clienti/${encodeURIComponent(codice)}/ordini?page=${page}&limit=${limit}`);
}

export async function catalogoListe(): Promise<Esito<CatalogoListe>> {
  return leggi<CatalogoListe>(`/api/v1/liste`, 5 * 60 * 1000);
}

export type ElencoDiLista = {
  lista: { chiave: string; nome: string };
  totale: number;
  page: number;
  limit: number;
  pagine: number;
  clienti: ClienteRiga[];
};

// I clienti di UNA lista di Orders (per il costruttore di liste del CRM).
// `riepilogo=si` porta anche riassunto e gusti: serve ai brief sui gusti.
export async function clientiDiLista(
  chiave: string,
  p: { page?: number; limit?: number; riepilogo?: boolean } = {},
): Promise<Esito<ElencoDiLista>> {
  const qs = new URLSearchParams();
  qs.set("page", String(p.page ?? 1));
  qs.set("limit", String(p.limit ?? 500));
  if (p.riepilogo) qs.set("riepilogo", "si");
  return leggi<ElencoDiLista>(`/api/v1/liste/${encodeURIComponent(chiave)}?${qs}`);
}

export async function ricorrenze(p: {
  cliente?: string;
  prossimi?: number;
  stato?: string;
  page?: number;
  limit?: number;
  /** TTL della cache per questa lettura (default 60 s); i pallini usano TTL_PALLINI_MS. */
  ttlMs?: number;
}): Promise<Esito<ElencoRicorrenze>> {
  const qs = new URLSearchParams();
  if (p.cliente) qs.set("cliente", p.cliente);
  if (p.prossimi != null) qs.set("prossimi", String(p.prossimi));
  if (p.stato) qs.set("stato", p.stato);
  qs.set("page", String(p.page ?? 1));
  qs.set("limit", String(p.limit ?? 100));
  return leggi<ElencoRicorrenze>(`/api/v1/eventi-clienti?${qs}`, p.ttlMs);
}

// TUTTE le ricorrenze entro N giorni, a pagine di 500 (il massimo di Orders):
// servono alla pagina Ricorrenze (che ordina e filtra in casa) e al
// Calendario (che le distribuisce sui giorni del mese). `troncato` dice se
// c'era altro oltre il tetto: mai un elenco parziale che sembra completo.
const MAX_PAGINE_RICORRENZE = 6; // 6 × 500 = 3000 ricorrenze al massimo

export async function tutteLeRicorrenze(p: {
  prossimi: number;
  stato?: string;
}): Promise<Esito<{ eventi: RicorrenzaCliente[]; totale: number; troncato: boolean }>> {
  const eventi: RicorrenzaCliente[] = [];
  let totale = 0;
  for (let page = 1; page <= MAX_PAGINE_RICORRENZE; page++) {
    const r = await ricorrenze({ prossimi: p.prossimi, stato: p.stato, page, limit: 500 });
    if (!r.ok) return r;
    totale = r.dati.totale;
    eventi.push(...r.dati.eventi);
    if (page >= r.dati.pagine) return { ok: true, dati: { eventi, totale, troncato: false } };
  }
  return { ok: true, dati: { eventi, totale, troncato: true } };
}

// Una ricorrenza scritta a mano si PROPONE a Orders, che ne è il proprietario
// (il CRM non tiene una tabella di compleanni: casa unica, standard §7).
export async function proponiRicorrenza(dati: {
  cliente: string;
  giorno: number;
  mese: number;
  destinatario?: string;
  titolo?: string;
  tipo?: string;
  note?: string;
}): Promise<Esito<{ ok: boolean; id: string }>> {
  const chiave = await chiaveApp("ORDERS_API_KEY");
  if (!chiave) return { ok: false, errore: "Manca ORDERS_API_KEY (serve una chiave di Orders con scrittura)." };
  try {
    const res = await fetch(`${base()}/api/v1/eventi-clienti`, {
      method: "POST",
      headers: { "x-api-key": chiave, "Content-Type": "application/json", "X-App": "deluxy-crm" },
      body: JSON.stringify(dati),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = (await res.json().catch(() => null)) as { errore?: string; ok?: boolean; id?: string } | null;
    if (!res.ok) return { ok: false, errore: corpo?.errore ?? `Orders risponde ${res.status}.` };
    // La ricorrenza è cambiata alla fonte: le letture in cache non valgono più.
    for (const k of cache.keys()) if (k.startsWith("/api/v1/eventi-clienti")) cache.delete(k);
    return { ok: true, dati: { ok: true, id: corpo?.id ?? "" } };
  } catch {
    return { ok: false, errore: "Orders non risponde: la ricorrenza non è stata salvata." };
  }
}

// I consensi si SCRIVONO in Orders (casa unica, §7): POST .../privacy con la
// chiave di scrittura. Manca un campo = non si tocca.
export async function scriviPrivacy(
  codice: string,
  dati: { email?: "si" | "no"; sms?: "si" | "no"; telefono?: "si" | "no"; bloccato?: boolean; note?: string; autore?: string },
): Promise<Esito<PrivacyCliente>> {
  const chiave = await chiaveApp("ORDERS_API_KEY");
  if (!chiave) return { ok: false, errore: "Manca ORDERS_API_KEY (serve una chiave di Orders con scrittura)." };
  try {
    const res = await fetch(`${base()}/api/v1/clienti/${encodeURIComponent(codice)}/privacy`, {
      method: "POST",
      headers: { "x-api-key": chiave, "Content-Type": "application/json", "X-App": "deluxy-crm" },
      body: JSON.stringify(dati),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = (await res.json().catch(() => null)) as { errore?: string; privacy?: PrivacyCliente } | null;
    if (!res.ok || !corpo?.privacy) return { ok: false, errore: corpo?.errore ?? `Orders risponde ${res.status}.` };
    // La scheda in cache non vale più.
    for (const k of cache.keys()) if (k.startsWith(`/api/v1/clienti/${encodeURIComponent(codice)}`)) cache.delete(k);
    return { ok: true, dati: corpo.privacy };
  } catch {
    return { ok: false, errore: "Orders non risponde: il consenso non è stato salvato." };
  }
}

// Una ricorrenza si CORREGGE in Orders (PATCH con chiave di scrittura): tipo,
// «per chi», titolo, note, stato. Quello che scrive una persona vince sull'AI.
export async function aggiornaRicorrenza(
  id: string,
  dati: { tipo?: string; destinatario?: string; titolo?: string; note?: string | null; stato?: string },
): Promise<Esito<{ id: string; fusa: boolean }>> {
  const chiave = await chiaveApp("ORDERS_API_KEY");
  if (!chiave) return { ok: false, errore: "Manca ORDERS_API_KEY (serve una chiave di Orders con scrittura)." };
  try {
    const res = await fetch(`${base()}/api/v1/eventi-clienti/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "x-api-key": chiave, "Content-Type": "application/json", "X-App": "deluxy-crm" },
      body: JSON.stringify(dati),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = (await res.json().catch(() => null)) as { errore?: string; id?: string; fusa?: boolean } | null;
    if (!res.ok) return { ok: false, errore: corpo?.errore ?? `Orders risponde ${res.status}.` };
    for (const k of cache.keys()) if (k.startsWith("/api/v1/eventi-clienti")) cache.delete(k);
    return { ok: true, dati: { id: corpo?.id ?? id, fusa: Boolean(corpo?.fusa) } };
  } catch {
    return { ok: false, errore: "Orders non risponde: la ricorrenza non è stata corretta." };
  }
}

// Orders raggiungibile e con la chiave giusta? Per la pagina Impostazioni.
export async function statoOrders(): Promise<{ raggiungibile: boolean; autenticato: boolean }> {
  try {
    const salute = await fetch(`${base()}/api/v1/health`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!salute.ok) return { raggiungibile: false, autenticato: false };
  } catch {
    return { raggiungibile: false, autenticato: false };
  }
  // ⚠️ La prova della chiave è una chiamata VERA, fuori dalla cache: prima
  // passava da `leggi()` con ttl 0 sulla stessa chiave di `catalogoListe`, e
  // (1) con la cache calda diceva «Collegato» senza chiamare nessuno, (2) a
  // cache fredda sovrascriveva la voce buona con una già scaduta, facendo
  // ripagare 1,1-1,4 s alla prossima Oggi/Clienti (revisione performance 10/09).
  const chiave = await chiaveApp("ORDERS_API_KEY");
  if (!chiave) return { raggiungibile: true, autenticato: false };
  try {
    const res = await fetch(`${base()}/api/v1/liste`, {
      headers: { "x-api-key": chiave, "X-App": "deluxy-crm" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return { raggiungibile: true, autenticato: res.ok };
  } catch {
    return { raggiungibile: true, autenticato: false };
  }
}

// La data dell'ULTIMO ORDINE valido del registro, per il pallino «Clienti»
// del menù. Prima si chiedeva a `/api/v1/clienti?ordina=ultimo&limit=1`, che
// in Orders esegue comunque la CTE intera dei clienti (868-1248 ms misurati
// il 10/09, `limit=1` non la sconta); `/api/v1/ordini?limit=1` dà lo stesso
// valore — `ultimoOrdine` di un cliente È `max(data)` dei suoi ordini non
// annullati, e la rotta esclude gli annullati — in 280-460 ms, senza la CTE.
// TTL 300 s dichiarato: Orders sincronizza da Shopify ogni 5 minuti, un
// pallino non può essere più fresco della fonte (Libro PERFORMANCE §6).
export const TTL_PALLINI_MS = 5 * 60 * 1000;

export async function dataUltimoOrdine(): Promise<Esito<string | null>> {
  const r = await leggi<{ ordini?: { data?: string }[] }>(`/api/v1/ordini?page=1&limit=1`, TTL_PALLINI_MS);
  if (!r.ok) return r;
  return { ok: true, dati: r.dati.ordini?.[0]?.data ?? null };
}
