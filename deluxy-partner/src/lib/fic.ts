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

export async function ficFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await ficAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Fatture in Cloud ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
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
    // ricerca su nome cliente o numero
    const q = opts.q.trim().replace(/'/g, "");
    filtri.push(`(entity.name contains '${q}' or numeration contains '${q}')`);
  }
  const query = filtri.length ? `&q=${encodeURIComponent(filtri.join(" and "))}` : "";
  const fields =
    "id,number,numeration,date,amount_net,amount_vat,amount_gross,amount_due,url,entity";

  const out: FicFattura[] = [];
  const maxPagine = opts?.maxPagine ?? 20;
  for (let page = 1; page <= maxPagine; page++) {
    const r = await ficFetch<{
      data: {
        id: number;
        number: number;
        numeration: string | null;
        date: string | null;
        amount_net: number;
        amount_vat: number;
        amount_gross: number;
        amount_due: number;
        url: string | null;
        entity?: { name?: string | null };
      }[];
      last_page?: number;
    }>(
      `/c/${companyId}/issued_documents?type=invoice&fields=${fields}&sort=-date,-number&per_page=50&page=${page}${query}`
    );
    for (const d of r.data) {
      const anno = (d.date ?? "").slice(0, 4);
      out.push({
        id: d.id,
        numero: `${d.number}${d.numeration?.trim() ? d.numeration : anno ? `/${anno}` : ""}`,
        data: d.date,
        cliente: d.entity?.name ?? "—",
        imponibile: d.amount_net,
        iva: d.amount_vat,
        totale: d.amount_gross,
        pagata: (d.amount_due ?? 0) <= 0.005,
        scadenza: null,
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
          entity: opts.entity ?? { id: opts.clienteId },
          date: dataDoc,
          visible_subject: opts.visibleSubject ?? "",
          items_list: righe.map((x) => ({
            name: x.descrizione,
            qty: x.quantita ?? 1,
            net_price: +x.prezzoUnitario.toFixed(2),
            vat: { id: idAliquota(x.aliquotaIva ?? 22) },
          })),
          ...(opts.scadenza
            ? {
                payments_list: [
                  { amount: +totale.toFixed(2), due_date: iso(opts.scadenza), status: "not_paid" },
                ],
              }
            : {}),
        },
      }),
    }
  );
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
