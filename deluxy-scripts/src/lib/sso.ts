import { createDecipheriv, createHash } from "crypto";

// Lettura del token di Single Sign-On del Deluxy Hub (copia 1:1 di
// `deluxy-hub/src/lib/sso.ts`, lato ricezione). Il Hub cifra il token con
// AES-256-GCM usando lo STESSO segreto condiviso `HUB_SSO_SECRET`: se il segreto
// non combacia, o il token è manomesso o scaduto, la lettura fallisce e l'app
// chiede il login normale.
//
// Solo runtime Node (crypto): da non importare nel middleware (Edge).

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
  email?: string; // il Hub la manda dalla v2 del token
  nome: string;
  ruolo: string; // ruolo lato Hub: l'app decide come mapparlo
  app: string; // id dell'app di destinazione (un token per Finance non vale qui)
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
    return null; // segreto sbagliato, token corrotto o HUB_SSO_SECRET assente
  }
}
