// Sessione FIRMATA che porta con sé l'identità della persona.
//
// Perché non basta il cookie vecchio: quello è l'impronta della password di
// team, quindi sa dire il ruolo ma non CHI è entrato. Con gli account personali
// il nome deve viaggiare nel cookie, e deve poterlo leggere anche il
// `middleware.ts` — che gira su Edge, dove non esistono né Prisma né
// `node:crypto`. Da qui i vincoli di questo file: solo Web Crypto, nessuna
// query, nessun import di server.
//
// Formato: v2.<payload base64url>.<firma base64url>
// La firma è HMAC-SHA256 del payload: il contenuto è leggibile (non è un
// segreto: nome, email, ruolo), ma non è modificabile senza la chiave — chi
// provasse a scriversi `ruolo: admin` produrrebbe una firma che non torna.

// I due profili di Budgets. «proposte» e chi manda il proprio budget e basta:
// qui dentro ci sono stipendi e premi, e non e roba che riguarda tutti.
export type Ruolo = "admin" | "proposte";

export type DatiSessione = {
  uid: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  via: "email" | "sso";
  exp: number; // millisecondi epoch
};

const PREFISSO = "v2.";

// Chiave di firma. Non introduce una variabile obbligatoria in più: usa
// AUTH_SECRET se c'è, altrimenti ricade su segreti già presenti. Conseguenza da
// conoscere: se la chiave deriva da BUDGETS_APP_PASSWORD, cambiare la password
// di team scollega tutti — che è esattamente quello che già succedeva prima.
function segreto(): string {
  return (
    process.env.APP_SECRET ||
    process.env.HUB_SSO_SECRET ||
    process.env.BUDGETS_APP_PASSWORD ||
    "deluxy-budgets-sviluppo-locale"
  );
}

async function chiave(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`deluxy-budgets:sessione:v2:${segreto()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64urlDaStringa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringaDaB64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function b64urlDaBytes(b: ArrayBuffer): string {
  let bin = "";
  for (const x of new Uint8Array(b)) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Torna un ArrayBuffer e non una Uint8Array: `crypto.subtle.verify` vuole un
// BufferSource con buffer garantito non condiviso, e il tipo di `Uint8Array.from`
// non lo garantisce.
function bytesDaB64url(s: string): ArrayBuffer {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Durata della sessione di un account personale. Più corta dei 30 giorni della
 *  password di team: disattivando un utente il middleware non può accorgersene
 *  subito (su Edge non c'è il database), quindi la finestra in cui una sessione
 *  già aperta sopravvive va tenuta stretta. */
export const DURATA_GIORNI = 7;

export async function creaSessione(d: Omit<DatiSessione, "exp">): Promise<string> {
  const payload = b64urlDaStringa(
    JSON.stringify({ ...d, exp: Date.now() + DURATA_GIORNI * 86400000 } satisfies DatiSessione)
  );
  const firma = await crypto.subtle.sign("HMAC", await chiave(), new TextEncoder().encode(payload));
  return `${PREFISSO}${payload}.${b64urlDaBytes(firma)}`;
}

/** Legge e VERIFICA il cookie. Torna null se non è del formato nuovo, se la
 *  firma non torna o se è scaduto: chi chiama non deve distinguere i casi,
 *  sono tutti «non sei autenticato». */
export async function leggiSessione(cookie: string | undefined): Promise<DatiSessione | null> {
  if (!cookie || !cookie.startsWith(PREFISSO)) return null;
  const [payload, firma] = cookie.slice(PREFISSO.length).split(".");
  if (!payload || !firma) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await chiave(),
      bytesDaB64url(firma),
      new TextEncoder().encode(payload)
    );
    if (!ok) return null;
    const d = JSON.parse(stringaDaB64url(payload)) as DatiSessione;
    if (typeof d.exp !== "number" || d.exp < Date.now()) return null;
    if (d.ruolo !== "admin" && d.ruolo !== "proposte") return null;
    return d;
  } catch {
    return null;
  }
}
