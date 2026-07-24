import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./db";

// Integrazione Fatture in Cloud (API v2) — app "FINANCE".
// Credenziali e token vivono nella tabella Impostazione (chiavi fic.*).
// Flusso: /api/fic/authorize → consenso su fattureincloud.it → /api/fic/callback
// scambia il codice con access+refresh token. L'access token dura 24h e viene
// rinnovato in automatico col refresh token ad ogni chiamata se scaduto.

const BASE = "https://api-v2.fattureincloud.it";

// Deve coincidere ESATTAMENTE con la Redirect URL registrata nell'app FINANCE
export const FIC_REDIRECT_URI = "https://deluxy-partner.vercel.app";

export const FIC_SCOPES = "entity.clients:a issued_documents.invoices:a";

async function leggi(chiavi: string[]): Promise<Record<string, string>> {
  const righe = await prisma.impostazione.findMany({ where: { chiave: { in: chiavi } } });
  return Object.fromEntries(righe.map((r) => [r.chiave, r.valore]));
}

async function salva(chiave: string, valore: string) {
  await prisma.impostazione.upsert({ where: { chiave }, create: { chiave, valore }, update: { valore } });
}

export async function ficCredenziali() {
  const m = await leggi(["fic.clientId", "fic.clientSecret"]);
  return { clientId: m["fic.clientId"], clientSecret: m["fic.clientSecret"] };
}

export async function ficStato() {
  const m = await leggi([
    "fic.clientId", "fic.accessToken", "fic.refreshToken", "fic.expiresAt",
    "fic.companyId", "fic.companyName",
  ]);
  return {
    credenziali: Boolean(m["fic.clientId"]),
    collegato: Boolean(m["fic.accessToken"] && m["fic.companyId"]),
    companyId: m["fic.companyId"] ? parseInt(m["fic.companyId"]) : null,
    companyName: m["fic.companyName"] ?? null,
  };
}

export function ficAuthorizeUrl(clientId: string, state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: FIC_REDIRECT_URI,
    scope: FIC_SCOPES,
    state,
  });
  return `${BASE}/oauth/authorize?${p.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

async function salvaToken(t: TokenResponse) {
  await salva("fic.accessToken", t.access_token);
  if (t.refresh_token) await salva("fic.refreshToken", t.refresh_token);
  await salva("fic.expiresAt", String(Date.now() + (t.expires_in - 120) * 1000));
}

export async function ficScambiaCodice(code: string): Promise<void> {
  const { clientId, clientSecret } = await ficCredenziali();
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: FIC_REDIRECT_URI,
      code,
    }),
  });
  if (!res.ok) throw new Error(`Scambio codice fallito (${res.status}): ${(await res.text()).slice(0, 200)}`);
  await salvaToken(await res.json());
}

async function ficAccessToken(): Promise<string> {
  const m = await leggi(["fic.accessToken", "fic.refreshToken", "fic.expiresAt"]);
  if (!m["fic.accessToken"]) throw new Error("Fatture in Cloud non collegato: vai in Impostazioni e premi Collega.");
  const scadenza = parseInt(m["fic.expiresAt"] ?? "0");
  if (Date.now() < scadenza) return m["fic.accessToken"];
  // rinnovo col refresh token
  if (!m["fic.refreshToken"]) throw new Error("Token Fatture in Cloud scaduto: ricollega da Impostazioni.");
  const { clientId, clientSecret } = await ficCredenziali();
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: m["fic.refreshToken"],
    }),
  });
  if (!res.ok) throw new Error(`Rinnovo token fallito (${res.status}): ricollega da Impostazioni.`);
  const t = (await res.json()) as TokenResponse;
  await salvaToken(t);
  return t.access_token;
}

/** Errore di Fatture in Cloud con lo stato HTTP, per distinguere il 429. */
export class FicError extends Error {
  constructor(readonly stato: number, readonly percorso: string, readonly dettaglio: string) {
    super(`Fatture in Cloud ${percorso} → ${stato}: ${dettaglio}`);
    this.name = "FicError";
  }
  /** true se FIC ha rifiutato per troppe richieste (rate limit). */
  get troppeRichieste() {
    return this.stato === 429;
  }
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

// FIC applica un rate limit per minuto: sotto carico (più pagine paginate, più
// schede aperte) risponde 429 TOO_MANY_REQUESTS. Invece di far fallire la pagina
// si aspetta e si riprova, rispettando l'header Retry-After quando c'è.
const TENTATIVI_429 = 3;

export async function ficFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await ficAccessToken();
  for (let tentativo = 0; ; tentativo++) {
    // timeout: una richiesta FIC appesa non deve bloccare l'intero render della pagina
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(12000),
    });
    if (res.ok) return (await res.json()) as T;

    const testo = (await res.text()).slice(0, 300);
    const riprovabile = res.status === 429 || res.status === 503;
    if (riprovabile && tentativo < TENTATIVI_429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "");
      const attesa = Number.isFinite(retryAfter) ? retryAfter * 1000 : 800 * 2 ** tentativo;
      await attendi(Math.min(attesa, 5000));
      continue;
    }
    throw new FicError(res.status, path, testo);
  }
}

export type FicCliente = { id: number; name: string; vat_number?: string | null };

// Elenco clienti dell'azienda (paginato)
export async function ficClienti(): Promise<FicCliente[]> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const clienti: FicCliente[] = [];
  for (let page = 1; page <= 30; page++) {
    const r = await ficFetch<{ data: FicCliente[]; last_page?: number }>(
      `/c/${companyId}/entities/clients?fields=id,name,vat_number&per_page=100&page=${page}`
    );
    clienti.push(...r.data);
    if (!r.last_page || page >= r.last_page) break;
  }
  return clienti;
}

// Una fattura come arriva da Fatture in Cloud (campi normalizzati per l'elenco).
export type FicFattura = {
  id: number;
  numero: string; // number + numeration (es. "212/2026")
  data: string | null; // YYYY-MM-DD
  cliente: string;
  imponibile: number;
  iva: number;
  totale: number;
  pagata: boolean; // amount_due == 0
  residuo: number; // quanto resta da incassare (IVA inclusa)
  incassato: number; // quanto già incassato (IVA inclusa) — saldi parziali
  scadenza: string | null; // prossima scadenza non pagata
  urlDettaglio: string | null; // link al documento su Fatture in Cloud
};

// Elenco delle fatture emesse su Fatture in Cloud (paginato, dalla più recente).
// `anno` filtra per anno di emissione; `q` cerca su cliente/numero.
export async function ficFatture(opts?: {
  anno?: number;
  q?: string;
  maxPagine?: number;
}): Promise<FicFattura[]> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");

  const filtri: string[] = [];
  if (opts?.anno) {
    filtri.push(`date >= '${opts.anno}-01-01'`);
    filtri.push(`date <= '${opts.anno}-12-31'`);
  }
  if (opts?.q?.trim()) {
    // ricerca su nome cliente o numero. `numeration` è la sigla della
    // numerazione (spesso vuota): il numero vero è `number`, quindi se si cerca
    // "474" va confrontato con quello, altrimenti non si trova nulla.
    const q = opts.q.trim().replace(/'/g, "");
    const perNumero = /^\d+$/.test(q) ? ` or number = ${parseInt(q)}` : "";
    filtri.push(`(entity.name contains '${q}' or numeration contains '${q}'${perNumero})`);
  }
  const query = filtri.length ? `&q=${encodeURIComponent(filtri.join(" and "))}` : "";
  // NB: nella lista FIC `amount_due` NON viene restituito (torna undefined) → lo
  // stato pagamento va calcolato dai `payments_list`, che invece ci sono.
  const fields =
    "id,number,numeration,date,amount_net,amount_vat,amount_gross,payments_list,url,entity";

  const out: FicFattura[] = [];
  const maxPagine = opts?.maxPagine ?? 20;
  for (let page = 1; page <= maxPagine; page++) {
    // una pausa fra una pagina e l'altra: sfilare 20 pagine di fila fa scattare
    // il rate limit di FIC (429) e la pagina non si carica più
    if (page > 1) await attendi(120);
    const r = await ficFetch<{
      data: {
        id: number;
        number: number;
        numeration: string | null;
        date: string | null;
        amount_net: number;
        amount_vat: number;
        amount_gross: number;
        payments_list?: { amount: number; due_date: string | null; status: string }[];
        url: string | null;
        entity?: { name?: string | null };
      }[];
      last_page?: number;
    }>(
      `/c/${companyId}/issued_documents?type=invoice&fields=${fields}&sort=-date,-number&per_page=50&page=${page}${query}`
    );
    for (const d of r.data) {
      const anno = (d.date ?? "").slice(0, 4);
      const pagamenti = d.payments_list ?? [];
      // "Saldata" = tutti i pagamenti in stato pagato (paid/settled). Qualsiasi
      // not_paid/reversed → ancora da incassare. Nessun pagamento → da incassare.
      const daPagare = pagamenti
        .filter((x) => x.status !== "paid" && x.status !== "settled")
        .reduce((a, x) => a + (x.amount ?? 0), 0);
      const pagata = pagamenti.length > 0 && daPagare <= 0.005;
      // residuo = quanto resta da incassare (i saldi parziali lo abbassano)
      const residuo = pagamenti.length > 0 ? Math.max(0, +daPagare.toFixed(2)) : d.amount_gross;
      const prossima = pagamenti
        .filter((x) => x.status === "not_paid")
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
      out.push({
        id: d.id,
        numero: `${d.number}${d.numeration?.trim() ? d.numeration : anno ? `/${anno}` : ""}`,
        data: d.date,
        cliente: d.entity?.name ?? "—",
        imponibile: d.amount_net,
        iva: d.amount_vat,
        totale: d.amount_gross,
        pagata,
        residuo,
        incassato: +(d.amount_gross - residuo).toFixed(2),
        scadenza: prossima?.due_date ?? null,
        urlDettaglio: d.url ?? null,
      });
    }
    if (!r.last_page || page >= r.last_page) break;
  }
  return out;
}

// Cliente FIC con i dati fiscali completi (per la riconciliazione anagrafica).
export type FicClienteFiscale = {
  nome: string;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
  email: string | null;
  pec: string | null; // certified_email
  codiceSdi: string | null; // ei_code
  telefono: string | null;
  referente: string | null;
};

function normPiva(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s/g, "").replace(/^IT/i, "").trim();
  return s || null;
}

// Elenco dei clienti FIC con dati fiscali, unendo rubrica e intestatari delle
// fatture emesse (dedup per nome). Serve alla riconciliazione col registro.
export async function ficClientiFiscali(): Promise<FicClienteFiscale[]> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const perNome = new Map<string, FicClienteFiscale>();
  const chiave = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  // ei_code = "0000000" è il placeholder FIC per "nessun codice SDI"
  const sdi = (v: string | null | undefined) => {
    const s = (v ?? "").trim().toUpperCase();
    return s && s !== "0000000" ? s : null;
  };
  const aggiungi = (e: FicEntity | undefined) => {
    const nome = e?.name?.trim();
    if (!nome) return;
    const k = chiave(nome);
    const esistente = perNome.get(k);
    const nuovo: FicClienteFiscale = {
      nome,
      piva: normPiva(e?.vat_number),
      codiceFiscale: e?.tax_code?.trim() || null,
      indirizzo: e?.address_street?.trim() || null,
      citta: e?.address_city?.trim() || null,
      cap: e?.address_postal_code?.trim() || null,
      provincia: e?.address_province?.trim() || null,
      email: e?.email?.trim() || null,
      pec: e?.certified_email?.trim() || null,
      codiceSdi: sdi(e?.ei_code),
      telefono: e?.phone?.trim() || null,
      referente: e?.referent?.trim() || null,
    };
    // preferisci l'entry più completa (più campi valorizzati)
    if (!esistente) perNome.set(k, nuovo);
    else {
      const conta = (x: FicClienteFiscale) => Object.values(x).filter(Boolean).length;
      if (conta(nuovo) > conta(esistente)) perNome.set(k, nuovo);
    }
  };

  // rubrica (con indirizzo, email, PEC, SDI, telefono, referente)
  const rubrica = await ficFetch<{ data: FicEntity[] }>(
    `/c/${companyId}/entities/clients?fields=name,vat_number,tax_code,address_street,address_city,address_postal_code,address_province,email,certified_email,ei_code,phone,referent&per_page=100&page=1`
  );
  for (const e of rubrica.data ?? []) aggiungi(e);

  // intestatari dalle fatture (anche non in rubrica)
  for (let page = 1; page <= 20; page++) {
    const r = await ficFetch<{ data: { entity?: FicEntity }[]; last_page?: number }>(
      `/c/${companyId}/issued_documents?type=invoice&fields=entity&per_page=100&sort=-date&page=${page}`
    );
    for (const d of r.data) aggiungi(d.entity);
    if (!r.last_page || page >= r.last_page) break;
  }

  return [...perNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

// Un intestatario selezionabile per una nuova fattura. `valore` distingue la
// fonte: "id:<n>" = cliente in rubrica; "nome:<nome>" = intestatario già usato
// in una fattura passata ma non salvato in rubrica (i dati fiscali si
// recuperano da quella fattura al momento dell'emissione).
export type FicClienteFatturabile = { valore: string; nome: string; piva: string | null; inRubrica: boolean };

// Elenco degli intestatari fatturabili: unione della rubrica clienti e dei
// clienti già comparsi nelle fatture emesse (così si può rifatturare anche chi,
// come alcune insegne, non è mai stato salvato in rubrica). Dedup per nome.
export async function ficClientiFatturabili(): Promise<FicClienteFatturabile[]> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");

  const perNome = new Map<string, FicClienteFatturabile>();
  const chiave = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

  // 1) rubrica clienti (hanno un id stabile)
  const rubrica = await ficClienti();
  for (const c of rubrica) {
    perNome.set(chiave(c.name), { valore: `id:${c.id}`, nome: c.name, piva: c.vat_number ?? null, inRubrica: true });
  }

  // 2) intestatari dalle fatture emesse (anche non in rubrica)
  for (let page = 1; page <= 20; page++) {
    const r = await ficFetch<{
      data: { entity?: { name?: string | null; vat_number?: string | null } }[];
      last_page?: number;
    }>(
      `/c/${companyId}/issued_documents?type=invoice&fields=entity&per_page=100&sort=-date&page=${page}`
    );
    for (const d of r.data) {
      const nome = d.entity?.name?.trim();
      if (!nome) continue;
      const k = chiave(nome);
      if (perNome.has(k)) continue; // già in rubrica: si preferisce l'id
      perNome.set(k, { valore: `nome:${nome}`, nome, piva: d.entity?.vat_number ?? null, inRubrica: false });
    }
    if (!r.last_page || page >= r.last_page) break;
  }

  return [...perNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

// Recupera i dati fiscali completi di un intestatario dall'ultima fattura in cui
// compare (per rifatturarlo senza salvarlo in rubrica). Il filtro `q` su
// entity.name è inaffidabile via API, quindi si scorrono le fatture recenti
// (dalla più recente) e si cerca il nome in memoria.
export async function ficEntityUltimaFattura(nome: string): Promise<FicEntity | null> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const cerca = nome.trim().toLowerCase().replace(/\s+/g, " ");
  for (let page = 1; page <= 20; page++) {
    const r = await ficFetch<{ data: { entity?: FicEntity }[]; last_page?: number }>(
      `/c/${companyId}/issued_documents?type=invoice&fields=entity&per_page=100&sort=-date&page=${page}`
    );
    for (const d of r.data) {
      const e = d.entity;
      if (e?.name && e.name.trim().toLowerCase().replace(/\s+/g, " ") === cerca) {
        return {
          name: e.name,
          vat_number: e.vat_number ?? null,
          tax_code: e.tax_code ?? null,
          address_street: e.address_street ?? null,
          address_postal_code: e.address_postal_code ?? null,
          address_city: e.address_city ?? null,
          address_province: e.address_province ?? null,
          country: e.country ?? null,
        };
      }
    }
    if (!r.last_page || page >= r.last_page) break;
  }
  return null;
}

// Crea una fattura (NON inviata allo SDI: l'invio si fa da Fatture in Cloud
// dopo il controllo). Il numero viene assegnato da Fatture in Cloud e
// restituito qui.
export type RigaFattura = {
  descrizione: string;
  quantita?: number;
  prezzoUnitario: number; // netto IVA
  aliquotaIva?: number; // % (default 22)
};

// Aliquote IVA configurate sull'azienda: servono per mandare righe con aliquote
// diverse dal 22%. Mappa "percentuale → id FIC"; in mancanza si usa l'id 0 (22%).
let cacheAliquote: Map<number, number> | null = null;
export async function ficAliquote(): Promise<Map<number, number>> {
  if (cacheAliquote) return cacheAliquote;
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  let r: { data: { id: number; value: number }[] };
  try {
    r = await ficFetch<{ data: { id: number; value: number }[] }>(`/c/${companyId}/info/vat_types`);
  } catch (e) {
    // senza il permesso di lettura delle impostazioni non possiamo mappare le
    // aliquote: meglio fermarsi che emettere una riga con l'IVA sbagliata
    throw new Error(
      "Non riesco a leggere le aliquote IVA da Fatture in Cloud " +
        `(${(e as Error).message}). Le righe non al 22% non possono essere emesse: ` +
        "ricollega l'account da Impostazioni concedendo anche i permessi sulle impostazioni, " +
        "oppure emetti la fattura direttamente su Fatture in Cloud."
    );
  }
  const m = new Map<number, number>();
  for (const v of r.data ?? []) if (!m.has(v.value)) m.set(v.value, v.id);
  cacheAliquote = m;
  return m;
}

// Dati fiscali di un intestatario "al volo" (non in rubrica): riusiamo quelli
// di una fattura passata per rifatturare lo stesso cliente senza salvarlo.
export type FicEntity = {
  name?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  country?: string | null;
  certified_email?: string | null; // PEC
  ei_code?: string | null; // codice destinatario SDI
  email?: string | null;
  phone?: string | null;
  referent?: string | null; // contatto/referente
};

// Crea una fattura su Fatture in Cloud. La fattura NON viene inviata allo SDI:
// il controllo e l'invio restano su FIC; qui torna solo il numero assegnato.
// Il cliente si indica con `clienteId` (rubrica) OPPURE `entity` (dati al volo).
// Accetta una riga singola (descrizione + imponibile) o più righe.
export async function ficCreaFattura(opts: {
  clienteId?: number;
  entity?: FicEntity;
  descrizione?: string;
  imponibile?: number;
  righe?: RigaFattura[];
  visibleSubject?: string;
  data?: Date;
  scadenza?: Date | null;
}): Promise<{ id: number; numero: string }> {
  if (!opts.clienteId && !opts.entity) {
    throw new Error("Indicare il cliente della fattura (id rubrica o dati entità).");
  }
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dataDoc = iso(opts.data ?? new Date());

  const righe: RigaFattura[] =
    opts.righe && opts.righe.length > 0
      ? opts.righe
      : [{ descrizione: opts.descrizione ?? "", prezzoUnitario: opts.imponibile ?? 0 }];

  // id dell'aliquota: serve solo se qualche riga non è al 22%
  const serveMappa = righe.some((r) => (r.aliquotaIva ?? 22) !== 22);
  const mappa = serveMappa ? await ficAliquote() : null;
  const idAliquota = (perc: number) => (perc === 22 ? 0 : mappa?.get(perc) ?? 0);

  const totale = righe.reduce(
    (a, r) => a + (r.quantita ?? 1) * r.prezzoUnitario * (1 + (r.aliquotaIva ?? 22) / 100),
    0
  );

  const r = await ficFetch<{ data: { id: number; number: number; numeration: string | null; date: string } }>(
    `/c/${companyId}/issued_documents`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "invoice",
          // fattura ELETTRONICA: altrimenti FIC la crea "non elettronica" (non
          // predisposta per lo SDI). Resta comunque NON inviata: l'invio allo SDI
          // si fa da Fatture in Cloud dopo il controllo.
          e_invoice: true,
          entity: opts.entity ?? { id: opts.clienteId },
          date: dataDoc,
          visible_subject: opts.visibleSubject ?? "",
          items_list: righe.map((x) => ({
            name: x.descrizione,
            qty: x.quantita ?? 1,
            net_price: +x.prezzoUnitario.toFixed(2),
            vat: { id: idAliquota(x.aliquotaIva ?? 22) },
          })),
          // Inviamo SEMPRE una scadenza di pagamento "not_paid": senza payments_list
          // Fatture in Cloud crea il documento come già saldato (amount_due = 0) e
          // comparirebbe "Saldata" appena creato. Se non c'è una scadenza esplicita,
          // usiamo la data documento (da incassare subito).
          payments_list: [
            { amount: +totale.toFixed(2), due_date: opts.scadenza ? iso(opts.scadenza) : dataDoc, status: "not_paid" },
          ],
        },
      }),
    }
  );
  // la nuova fattura deve comparire subito negli elenchi cachati (ficFattureCached)
  revalidateTag("fic");
  const d = r.data;
  const anno = (d.date ?? dataDoc).slice(0, 4);
  return { id: d.id, numero: `${d.number}${d.numeration?.trim() ? d.numeration : `/${anno}`}` };
}

// Dopo il collegamento: memorizza l'azienda su cui operare (la prima, o "Deluxy" se presente)
export async function ficSelezionaAzienda(): Promise<{ id: number; name: string }> {
  const data = await ficFetch<{ data: { companies: { id: number; name: string }[] } }>(
    "/user/companies"
  );
  const companies = data.data.companies ?? [];
  if (!companies.length) throw new Error("Nessuna azienda trovata sull'account Fatture in Cloud.");
  const scelta = companies.find((c) => /deluxy/i.test(c.name)) ?? companies[0];
  await salva("fic.companyId", String(scelta.id));
  await salva("fic.companyName", scelta.name);
  return scelta;
}

// ————— Cache dei listati FIC (per le pagine che li mostrano) —————
// I clienti FIC e le fatture emesse cambiano di rado ma costano molte chiamate
// paginate in serie: qui le memorizziamo 5 minuti così il render (e i ricarichi)
// sono immediati. Le usano le pagine di sola lettura; le azioni (creazione,
// riconciliazione) continuano a usare le versioni non cachate per avere dati freschi.
export const ficClientiCached = unstable_cache(async () => ficClienti(), ["fic-clienti"], {
  revalidate: 300,
  tags: ["fic"],
});
export const ficClientiFatturabiliCached = unstable_cache(async () => ficClientiFatturabili(), ["fic-clienti-fatturabili"], {
  revalidate: 300,
  tags: ["fic"],
});
export const ficFattureCached = unstable_cache(
  async (opts?: { anno?: number; q?: string; maxPagine?: number }) => ficFatture(opts),
  ["fic-fatture"],
  { revalidate: 300, tags: ["fic"] }
);

// Cambia lo stato di incasso di una fattura su Fatture in Cloud: segna i suoi
// pagamenti come "paid" (saldata) o "not_paid" (da incassare). Aggiorna solo il
// tracciamento pagamenti, non il documento fiscale.
export async function ficSegnaFatturaPagata(id: number, pagata: boolean, data?: Date): Promise<void> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const oggi = (data ?? new Date()).toISOString().slice(0, 10);
  // NB: niente `fields=` qui — con la selezione dei campi FIC restituisce le
  // scadenze incomplete (senza `due_date`) e riscrivendole si sposterebbe la
  // scadenza della fattura. Serve il documento intero.
  const cur = await ficFetch<{
    data: { payments_list?: FicPagamento[]; amount_gross?: number };
  }>(`/c/${companyId}/issued_documents/${id}`);
  let payments = cur.data.payments_list ?? [];
  if (payments.length === 0) {
    payments = [{ amount: cur.data.amount_gross ?? 0, due_date: oggi, status: "not_paid" }];
  }
  // FIC rifiuta un pagamento "paid" senza conto di saldo (422 «É necessario
  // impostare il conto di saldo nel pagamento»): se la scadenza non ne ha uno,
  // si usa il conto predefinito dell'azienda.
  const conto = pagata ? await ficContoSaldo(companyId) : null;
  const nuovi = payments.map((p) => ({
    ...(p.id ? { id: p.id } : {}), // aggiorna la scadenza esistente, non la sostituisce
    amount: p.amount,
    due_date: p.due_date ?? oggi,
    status: pagata ? "paid" : "not_paid",
    ...(pagata
      ? { paid_date: oggi, payment_account: p.payment_account ?? (conto ? { id: conto } : undefined) }
      : { paid_date: null, payment_account: null }),
  }));
  await ficFetch(`/c/${companyId}/issued_documents/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data: { payments_list: nuovi } }),
  });
  revalidateTag("fic");
}

// Una scadenza di pagamento come la tratta FIC.
type FicPagamento = {
  id?: number;
  amount: number;
  due_date: string | null;
  status: string;
  paid_date?: string | null;
  payment_account?: { id: number } | null;
};

// Conto su cui registrare gli incassi segnati dall'app. Si sceglie una volta e
// si memorizza in `fic.contoSaldo`: prima si prova l'elenco conti dell'azienda
// (serve lo scope `settings:r`), altrimenti si riusa il conto già usato su una
// fattura saldata a mano in FIC — così l'incasso finisce dove finiscono gli altri.
async function ficContoSaldo(companyId: number): Promise<number | null> {
  const m = await leggi(["fic.contoSaldo"]);
  const salvato = m["fic.contoSaldo"] ? parseInt(m["fic.contoSaldo"]) : NaN;
  if (Number.isFinite(salvato)) return salvato;
  let conto: number | null = null;
  try {
    const r = await ficFetch<{ data: { id: number; virtual?: boolean }[] }>(
      `/c/${companyId}/info/payment_accounts`
    );
    conto = r.data?.find((c) => !c.virtual)?.id ?? r.data?.[0]?.id ?? null;
  } catch {
    // scope non concesso: si guarda come sono state saldate le altre fatture
  }
  if (!conto) {
    try {
      const r = await ficFetch<{ data: { payments_list?: FicPagamento[] }[] }>(
        `/c/${companyId}/issued_documents?type=invoice&fields=payments_list&sort=-date&per_page=50`
      );
      for (const d of r.data ?? []) {
        const p = (d.payments_list ?? []).find((x) => x.status === "paid" && x.payment_account?.id);
        if (p?.payment_account?.id) {
          conto = p.payment_account.id;
          break;
        }
      }
    } catch {
      // niente da fare: si lascia decidere a FIC (che risponderà 422)
    }
  }
  if (conto) await salva("fic.contoSaldo", String(conto));
  return conto;
}

// Registra un incasso PARZIALE su una fattura FIC identificata dal suo id: legge
// lo stato attuale, aggiunge `importo` al già incassato e riscrive i pagamenti
// come «parte pagata / resto da incassare». Se copre tutto, la fattura risulta
// saldata. Ritorna il residuo dopo l'incasso, o null se qualcosa va storto.
export async function ficIncassaParzialePerId(id: number, importo: number, data?: Date): Promise<number | null> {
  const { companyId } = await ficStato();
  if (!companyId) throw new Error("Fatture in Cloud non collegato.");
  const oggi = (data ?? new Date()).toISOString().slice(0, 10);
  const cur = await ficFetch<{
    data: { payments_list?: FicPagamento[]; amount_gross?: number };
  }>(`/c/${companyId}/issued_documents/${id}`);
  const payments = cur.data.payments_list ?? [];
  const totale = +(cur.data.amount_gross ?? 0).toFixed(2);
  const daPagare = payments.length
    ? payments.filter((p) => p.status !== "paid" && p.status !== "settled").reduce((a, p) => a + p.amount, 0)
    : totale;
  const giaPagato = +(totale - daPagare).toFixed(2);
  const nuovoIncassato = +Math.min(totale, giaPagato + importo).toFixed(2);
  const residuo = +(totale - nuovoIncassato).toFixed(2);
  const scad = payments.find((p) => p.due_date)?.due_date ?? oggi;
  const conto = await ficContoSaldo(companyId);
  const righe =
    residuo <= 0.005
      ? [{ amount: totale, due_date: scad, status: "paid", paid_date: oggi, ...(conto ? { payment_account: { id: conto } } : {}) }]
      : [
          { amount: nuovoIncassato, due_date: scad, status: "paid", paid_date: oggi, ...(conto ? { payment_account: { id: conto } } : {}) },
          { amount: residuo, due_date: scad, status: "not_paid" },
        ];
  await ficFetch(`/c/${companyId}/issued_documents/${id}`, {
    method: "PUT",
    body: JSON.stringify({ data: { payments_list: righe } }),
  });
  revalidateTag("fic");
  return residuo;
}

// Trova su FIC il documento corrispondente a un numero interno tipo "474/2026"
// (o "474"): ritorna l'id FIC, oppure null se non c'è.
export async function ficIdDaNumero(numero: string, annoFallback?: number): Promise<number | null> {
  const { companyId } = await ficStato();
  if (!companyId) return null;
  const m = numero.trim().match(/^(\d+)\s*(?:\/\s*(\d{4}))?/);
  if (!m) return null;
  const num = parseInt(m[1]);
  const anno = m[2] ? parseInt(m[2]) : annoFallback;
  const filtri = [`number = ${num}`];
  if (anno) filtri.push(`date >= '${anno}-01-01'`, `date <= '${anno}-12-31'`);
  const r = await ficFetch<{ data: { id: number }[] }>(
    `/c/${companyId}/issued_documents?type=invoice&fields=id&per_page=5&q=${encodeURIComponent(filtri.join(" and "))}`
  );
  return r.data.length === 1 ? r.data[0].id : null;
}

// Allinea a Fatture in Cloud lo stato di incasso deciso nell'app (fattura
// segnata saldata a mano o dalla riconciliazione bancaria): senza questo la
// fattura restava «Da incassare» su FIC e nell'elenco /registrazioni/fatture.
// Non deve MAI far fallire l'azione locale: gli errori si ignorano (FIC non
// collegato, numero non trovato, API giù) — al massimo lo stato resta da
// allineare a mano dal pulsante «Segna saldata» dell'elenco fatture.
export async function ficAllineaStatoFattura(
  numero: string | null | undefined,
  pagata: boolean,
  opts?: { anno?: number; data?: Date | null }
): Promise<boolean> {
  if (!numero) return false;
  try {
    const stato = await ficStato();
    if (!stato.collegato) return false;
    const id = await ficIdDaNumero(numero, opts?.anno);
    if (!id) return false;
    await ficSegnaFatturaPagata(id, pagata, opts?.data ?? undefined);
    return true;
  } catch (e) {
    // silenzioso per l'utente, ma tracciato nei log (Vercel) per capire perché
    console.warn(`[fic] stato incasso non allineato per la fattura ${numero}:`, (e as Error).message);
    return false;
  }
}

// Riflette su Fatture in Cloud un INCASSO PARZIALE: la fattura resta aperta ma
// con parte già saldata. Riscrive i payments_list come due righe pulite — una
// «paid» pari all'incassato e una «not_paid» pari al residuo — così su FIC
// l'importo dovuto (amount_due) scende. Best-effort e non bloccante come sopra.
export async function ficAllineaIncassoParziale(
  numero: string | null | undefined,
  incassato: number,
  totaleIvato: number,
  opts?: { anno?: number; data?: Date | null }
): Promise<boolean> {
  if (!numero) return false;
  const residuo = +(totaleIvato - incassato).toFixed(2);
  // se copre tutto o niente, è il caso già gestito dallo stato pieno
  if (incassato <= 0.005) return ficAllineaStatoFattura(numero, false, opts);
  if (residuo <= 0.005) return ficAllineaStatoFattura(numero, true, opts);
  try {
    const stato = await ficStato();
    if (!stato.collegato || !stato.companyId) return false;
    const id = await ficIdDaNumero(numero, opts?.anno);
    if (!id) return false;
    const oggi = (opts?.data ?? new Date()).toISOString().slice(0, 10);
    const cur = await ficFetch<{ data: { payments_list?: FicPagamento[] } }>(
      `/c/${stato.companyId}/issued_documents/${id}`
    );
    const scad = cur.data.payments_list?.find((p) => p.due_date)?.due_date ?? oggi;
    const conto = await ficContoSaldo(stato.companyId);
    const nuovi = [
      { amount: +incassato.toFixed(2), due_date: scad, status: "paid", paid_date: oggi, ...(conto ? { payment_account: { id: conto } } : {}) },
      { amount: residuo, due_date: scad, status: "not_paid" },
    ];
    await ficFetch(`/c/${stato.companyId}/issued_documents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ data: { payments_list: nuovi } }),
    });
    revalidateTag("fic");
    return true;
  } catch (e) {
    console.warn(`[fic] incasso parziale non allineato per la fattura ${numero}:`, (e as Error).message);
    return false;
  }
}
