import { prisma } from "./db";

// Integrazione Qonto (API terze parti, autenticazione con API key).
// Credenziali in Impostazioni: login (es. "deluxy-1234") e secret key,
// generate dall'app Qonto in Impostazioni → Integrazioni e Partner → Chiave API.
// Sola lettura: usiamo /organization (verifica) e /transactions (sync movimenti).

const BASE = "https://thirdparty.qonto.com/v2";

async function leggi(chiavi: string[]): Promise<Record<string, string>> {
  const righe = await prisma.impostazione.findMany({ where: { chiave: { in: chiavi } } });
  return Object.fromEntries(righe.map((r) => [r.chiave, r.valore]));
}

export async function qontoConfig() {
  const m = await leggi(["qonto.login", "qonto.secretKey"]);
  return { login: m["qonto.login"], secretKey: m["qonto.secretKey"] };
}

export async function qontoConfigurato(): Promise<boolean> {
  const c = await qontoConfig();
  return Boolean(c.login && c.secretKey);
}

async function qontoFetch<T>(path: string): Promise<T> {
  const { login, secretKey } = await qontoConfig();
  if (!login || !secretKey) {
    throw new Error("Qonto non configurato: inserisci login e secret key in Impostazioni.");
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `${login}:${secretKey}` },
  });
  if (res.status === 401) {
    throw new Error("Credenziali Qonto non valide (401): ricontrolla login e secret key.");
  }
  if (!res.ok) {
    throw new Error(`Qonto ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type QontoConto = {
  slug: string;
  iban: string;
  name?: string;
  balance: number;
  currency: string;
  status?: string;
};

export async function qontoOrganizzazione(): Promise<{ nome: string; conti: QontoConto[] }> {
  const r = await qontoFetch<{ organization: { slug: string; legal_name?: string; bank_accounts: QontoConto[] } }>(
    "/organization"
  );
  return {
    nome: r.organization.legal_name || r.organization.slug,
    conti: r.organization.bank_accounts ?? [],
  };
}

export type QontoTransazione = {
  transaction_id: string;
  amount: number; // sempre positivo
  side: "debit" | "credit";
  settled_at: string | null;
  emitted_at: string;
  label: string | null;
  reference: string | null;
  currency: string;
  status: string; // pending | completed | declined
};

// Movimenti completati di un conto (IBAN), paginati, dal più recente
export async function qontoTransazioni(iban: string, maxPagine = 30): Promise<QontoTransazione[]> {
  const tutte: QontoTransazione[] = [];
  let pagina = 1;
  for (; pagina <= maxPagine; pagina++) {
    const r = await qontoFetch<{ transactions: QontoTransazione[]; meta: { next_page: number | null } }>(
      `/transactions?iban=${encodeURIComponent(iban)}&status%5B%5D=completed&per_page=100&current_page=${pagina}&sort_by=settled_at%3Adesc`
    );
    tutte.push(...r.transactions);
    if (!r.meta?.next_page) break;
  }
  return tutte;
}
