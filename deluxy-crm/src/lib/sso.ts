import { createDecipheriv, createHash } from "crypto";

// Lettura del token di Single Sign-On del Deluxy Hub (copia 1:1 di
// `deluxy-hub/src/lib/sso.ts`, lato ricezione, come in Calendario/Tasks). Il
// Hub cifra il token con AES-256-GCM usando lo STESSO segreto condiviso
// `HUB_SSO_SECRET`. Solo runtime Node (crypto): da non importare nel
// middleware (Edge).

const DOMINIO = "deluxy-sso:v1:";

// Il segreto condiviso viene impostato a mano nelle env dei progetti Vercel, e
// `vercel env add` letto da stdin AGGIUNGE UN A-CAPO al valore: due app che
// hanno "lo stesso" segreto possono così derivare chiavi diverse e il salto dal
// Hub finisce sul login senza dire perché. Qui si provano le varianti che
// differiscono solo per spazi/a-capo in coda.
function chiavi(): Buffer[] {
  const s = process.env.HUB_SSO_SECRET;
  if (!s || s.trim().length < 32) {
    throw new Error("HUB_SSO_SECRET mancante o troppo corto (minimo 32 caratteri).");
  }
  const varianti = [s, s.trim(), `${s.trim()}\n`, `${s.trim()}\r\n`];
  return [...new Set(varianti)].map((v) => createHash("sha256").update(DOMINIO).update(v).digest());
}

export type PayloadSso = {
  uid: string;
  email?: string;
  nome: string;
  ruolo: string; // ruolo lato Hub: l'app decide come mapparlo
  app: string; // id dell'app di destinazione (un token per il Calendario non vale qui)
  exp: number; // millisecondi epoch
};

export function leggiTokenSso(token: string): PayloadSso | null {
  const [iv, tag, dati] = token.split(".");
  if (!iv || !tag || !dati) return null;

  for (const chiave of sicure(chiavi)) {
    try {
      const d = createDecipheriv("aes-256-gcm", chiave, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      const json = Buffer.concat([d.update(Buffer.from(dati, "base64url")), d.final()]).toString("utf8");
      const p = JSON.parse(json) as PayloadSso;
      if (typeof p.exp !== "number" || p.exp < Date.now()) return null; // scaduto
      return p;
    } catch {
      // Questa variante del segreto non apre il token: si prova la prossima.
    }
  }
  return null; // segreto sbagliato, token corrotto o HUB_SSO_SECRET assente
}

// HUB_SSO_SECRET assente o troppo corto: nessuna chiave, quindi nessun accesso.
function sicure(f: () => Buffer[]): Buffer[] {
  try {
    return f();
  } catch {
    return [];
  }
}
