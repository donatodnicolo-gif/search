// Rubrica Google dell'operatore, lato browser: Google Identity Services per il
// token OAuth (scope contacts) + People API per cercare/creare i contatti.
// Usato dalla tabella di /contatti e dal salvataggio automatico quando
// un'azienda diventa cliente. Funziona solo in componenti client.

import { GOOGLE_OAUTH_CLIENT_ID } from "@/lib/google";
import { nomeRubricaDefault } from "@/lib/rubrica";

export type RigaContatto = {
  id: string;
  nome: string | null;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  fonte: string | null;
  hubspotId: string | null;
  nomeRubrica: string | null;
  partnerId: string;
  partnerNome: string;
  categoria: string | null;
  citta: string | null;
  stato: string;
  statoLabel: string;
  provincia: string | null;
  indirizzo: string | null;
  ragioneSociale: string | null;
  affiliatoReseller: boolean;
};

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: unknown) => { requestAccessToken: () => void } } } };
  }
}
let gisReady: Promise<void> | null = null;
let gisToken: { token: string; exp: number } | null = null;

function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Impossibile caricare Google Identity."));
    document.head.appendChild(s);
  });
  return gisReady;
}

// `silenzioso`: niente popup, riesce solo se l'operatore ha già dato il
// consenso in passato (prompt vuoto). Serve al salvataggio automatico, che
// parte senza un click e verrebbe altrimenti bloccato dal popup blocker.
export async function getToken(silenzioso = false): Promise<string> {
  if (gisToken && gisToken.exp > Date.now()) return gisToken.token;
  await loadGis();
  return new Promise((res, rej) => {
    const tc = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID.trim(),
      scope: "https://www.googleapis.com/auth/contacts",
      ...(silenzioso ? { prompt: "" } : {}),
      callback: (t: { access_token?: string; expires_in?: number }) => {
        if (t?.access_token) {
          gisToken = { token: t.access_token, exp: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 };
          res(t.access_token);
        } else rej(new Error("Autorizzazione rubrica negata."));
      },
      error_callback: (err: { message?: string }) => rej(new Error(err?.message || "Autorizzazione annullata.")),
    });
    tc.requestAccessToken();
  });
}

// Nome in rubrica: il "Nome su rubrica" della scheda contatto se compilato,
// altrimenti [STATO] [AZIENDA] [CITTÀ] [Nome contatto].
export function contactName(r: RigaContatto): string {
  return r.nomeRubrica?.trim() || nomeRubricaDefault(r);
}

// Cerca il numero in rubrica (People API searchContacts, con warm-up)
export async function findByPhone(token: string, phone: string): Promise<{ names?: { displayName?: string }[] } | null> {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  const coda = digits.slice(-9);
  const auth = { headers: { Authorization: "Bearer " + token } };
  await fetch("https://people.googleapis.com/v1/people:searchContacts?query=&readMask=names", auth).catch(() => {});
  for (const q of [...new Set([phone.trim(), digits, coda])].filter(Boolean)) {
    const r = await fetch(
      "https://people.googleapis.com/v1/people:searchContacts?pageSize=10&readMask=names,phoneNumbers&query=" + encodeURIComponent(q),
      auth,
    );
    if (!r.ok) continue;
    const results = ((await r.json()).results || []) as { person?: { names?: unknown[]; phoneNumbers?: { value?: string }[] } }[];
    for (const res of results) {
      const p = res.person || {};
      const trovato = (p.phoneNumbers || []).some((x) => {
        const d = String(x.value || "").replace(/[^\d]/g, "");
        return d && (d.endsWith(coda) || coda.endsWith(d.slice(-9)));
      });
      if (trovato) return p as { names?: { displayName?: string }[] };
    }
  }
  return null;
}

export async function createContact(token: string, r: RigaContatto): Promise<void> {
  const body = {
    names: [{ givenName: contactName(r) }],
    organizations: [{ name: r.ragioneSociale || r.partnerNome }],
    phoneNumbers: r.telefono ? [{ value: r.telefono, type: "work" }] : [],
    emailAddresses: r.email ? [{ value: r.email, type: "work" }] : [],
    addresses: r.indirizzo ? [{ formattedValue: r.indirizzo, type: "work" }] : [],
    biographies: [{ value: "Deluxy Anagrafiche" + (r.categoria ? " · " + r.categoria : "") }],
  };
  const res = await fetch("https://people.googleapis.com/v1/people:createContact", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.error?.message || "HTTP " + res.status);
  }
}

// Verifica per numero e crea solo se assente. Ritorna l'esito per la UI.
export async function salvaSeAssente(
  token: string,
  r: RigaContatto,
): Promise<{ fase: "presente" | "aggiunto"; testo: string }> {
  if (r.telefono) {
    const esistente = await findByPhone(token, r.telefono);
    if (esistente) {
      const nome = esistente.names?.[0]?.displayName;
      return { fase: "presente", testo: "Già in rubrica" + (nome ? `: ${nome}` : "") };
    }
  }
  await createContact(token, r);
  return { fase: "aggiunto", testo: "Aggiunto ✓" };
}

// Ripiego senza OAuth: file .vcf che la rubrica apre direttamente
export function downloadVcf(r: RigaContatto) {
  const e = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const l = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + e(contactName(r)), "ORG:" + e(r.ragioneSociale || r.partnerNome)];
  if (r.telefono) l.push("TEL;TYPE=WORK:" + e(r.telefono));
  if (r.email) l.push("EMAIL;TYPE=WORK:" + e(r.email));
  if (r.indirizzo) l.push("ADR;TYPE=WORK:;;" + e(r.indirizzo) + ";;;;");
  l.push("END:VCARD");
  const blob = new Blob([l.join("\r\n")], { type: "text/vcard;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (r.nome || r.partnerNome || "contatto").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() + ".vcf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
