import { createDecipheriv, createHash } from "crypto";

// Lettura del token di Single Sign-On generato dal Hub. Deve usare lo STESSO
// segreto condiviso HUB_SSO_SECRET e la stessa derivazione di chiave del Hub
// (src/lib/sso.ts di deluxy-hub). Cifrato AES-256-GCM: se il segreto è diverso
// o il token è manomesso, la decifratura fallisce e restituiamo null.

const DOMINIO = "deluxy-sso:v1:";

function chiave(): Buffer {
  const s = process.env.HUB_SSO_SECRET;
  if (!s || s.length < 32) {
    throw new Error("HUB_SSO_SECRET mancante o troppo corto (minimo 32 caratteri).");
  }
  return createHash("sha256").update(DOMINIO).update(s).digest();
}

export type PayloadSso = {
  uid: string;
  nome: string;
  ruolo: string; // ruolo lato Hub
  app: string; // id dell'app di destinazione
  exp: number; // millisecondi epoch
};

export function leggiTokenSso(token: string): PayloadSso | null {
  try {
    const [iv, tag, dati] = token.split(".");
    if (!iv || !tag || !dati) return null;
    const d = createDecipheriv("aes-256-gcm", chiave(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    const json = Buffer.concat([d.update(Buffer.from(dati, "base64url")), d.final()]).toString("utf8");
    const p = JSON.parse(json) as PayloadSso;
    if (typeof p.exp !== "number" || p.exp < Date.now()) return null; // scaduto
    return p;
  } catch {
    return null;
  }
}
