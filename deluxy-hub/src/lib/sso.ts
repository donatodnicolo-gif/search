import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Token di Single Sign-On: il Hub lo cifra (AES-256-GCM) e lo passa all'app di
// destinazione, che lo decifra con lo STESSO segreto condiviso HUB_SSO_SECRET.
// Cifrato (non solo firmato) così nell'URL non compaiono dati personali; GCM
// autentica, quindi un token manomesso non si apre. La chiave deriva da un
// segreto condiviso: entrambe le app devono avere lo stesso HUB_SSO_SECRET.

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
  ruolo: string; // ruolo lato Hub: l'app decide come mapparlo
  app: string; // id dell'app di destinazione (evita che un token valga per un'altra)
  exp: number; // millisecondi epoch
};

export function creaTokenSso(p: PayloadSso): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chiave(), iv);
  const dati = Buffer.concat([c.update(JSON.stringify(p), "utf8"), c.final()]);
  return [
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    dati.toString("base64url"),
  ].join(".");
}

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
    return null; // firma/segreto sbagliati o token corrotto
  }
}
