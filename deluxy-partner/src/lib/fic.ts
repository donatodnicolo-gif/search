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
