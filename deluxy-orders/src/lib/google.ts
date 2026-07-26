// Client Google People API per salvare i clienti nella rubrica.
// Portato da deluxy-messaging (src/lib/google.ts), con due differenze:
//  - le credenziali arrivano dall'ambiente (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)
//    invece che da una tabella cifrata: Orders tiene tutti i segreti nell'ambiente;
//  - il marcatore è "Deluxy Orders".
//
// Il marcatore è la salvaguardia più importante: finisce nella biografia del
// contatto e distingue i contatti creati da questa app da quelli personali
// dell'utente. Un contatto SENZA marcatore non viene mai modificato.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PEOPLE = "https://people.googleapis.com/v1";

export const MARCATORE = "Deluxy Orders";

export function googleConfigurato(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN,
  );
}

// Conia un access token dal refresh token salvato (valido ~1h).
export async function accessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google non è collegato: mancano GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `Refresh del token Google fallito (HTTP ${res.status})`);
  }
  return j.access_token;
}

export type ContattoTrovato = {
  resourceName: string;
  etag: string;
  nome: string;
  nostro: boolean; // ha il marcatore: creato da questa app
};

// Cerca un contatto per numero di telefono (deduplica sulle ultime 9 cifre).
export async function cercaPerTelefono(token: string, telefono: string): Promise<ContattoTrovato | null> {
  const cifre = telefono.replace(/[^\d]/g, "");
  if (cifre.length < 6) return null;
  const coda = cifre.slice(-9);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // "warm-up": la prima searchContacts dopo un periodo di inattività torna vuota
  await fetch(`${PEOPLE}/people:searchContacts?query=&readMask=names`, auth).catch(() => {});

  for (const q of [...new Set([telefono.trim(), cifre, coda])].filter(Boolean)) {
    const r = await fetch(
      `${PEOPLE}/people:searchContacts?pageSize=10&readMask=names,phoneNumbers,biographies&query=${encodeURIComponent(q)}`,
      auth,
    );
    if (!r.ok) continue;
    const results = ((await r.json()).results || []) as {
      person?: {
        resourceName?: string;
        etag?: string;
        names?: { displayName?: string }[];
        phoneNumbers?: { value?: string }[];
        biographies?: { value?: string }[];
      };
    }[];
    for (const res of results) {
      const p = res.person || {};
      const combacia = (p.phoneNumbers || []).some((x) => {
        const d = String(x.value || "").replace(/[^\d]/g, "");
        return d && (d.endsWith(coda) || coda.endsWith(d.slice(-9)));
      });
      if (combacia && p.resourceName) {
        return {
          resourceName: p.resourceName,
          etag: p.etag ?? "",
          nome: p.names?.[0]?.displayName || "contatto senza nome",
          nostro: (p.biographies || []).some((b) => (b.value || "").includes(MARCATORE)),
        };
      }
    }
  }
  return null;
}

export type DatiContatto = {
  nome: string;
  telefono?: string | null;
  email?: string | null;
  indirizzo?: string | null;
  note?: string | null;
};

function corpoContatto(c: DatiContatto) {
  return {
    // givenName soltanto: il nome che componiamo è già completo
    names: [{ givenName: c.nome || "Cliente Deluxy" }],
    phoneNumbers: c.telefono ? [{ value: c.telefono, type: "mobile" }] : [],
    emailAddresses: c.email ? [{ value: c.email, type: "home" }] : [],
    addresses: c.indirizzo ? [{ formattedValue: c.indirizzo, type: "home" }] : [],
    biographies: [{ value: MARCATORE + (c.note ? ` · ${c.note}` : "") }],
  };
}

const CAMPI = "names,phoneNumbers,emailAddresses,addresses,biographies";

export async function creaContatto(token: string, c: DatiContatto): Promise<{ resourceName: string }> {
  const res = await fetch(`${PEOPLE}/people:createContact`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpoContatto(c)),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(await messaggioErrore(res));
  const j = (await res.json()) as { resourceName?: string };
  return { resourceName: j.resourceName ?? "" };
}

export async function aggiornaContatto(
  token: string,
  resourceName: string,
  etag: string,
  c: DatiContatto,
): Promise<void> {
  const res = await fetch(
    `${PEOPLE}/${resourceName}:updateContact?updatePersonFields=${encodeURIComponent(CAMPI)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ etag, ...corpoContatto(c) }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!res.ok) throw new Error(await messaggioErrore(res));
}

async function messaggioErrore(res: Response): Promise<string> {
  const testo = await res.text().catch(() => "");
  try {
    const j = JSON.parse(testo);
    const m = j?.error?.message;
    if (m) return `Google: ${m}`;
  } catch {
    /* testo non JSON */
  }
  if (res.status === 429) return "Google: troppe richieste (quota People API) — riprova fra qualche minuto.";
  return `Google ha risposto ${res.status}: ${testo.slice(0, 160)}`;
}
