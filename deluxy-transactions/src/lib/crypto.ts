import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "crypto";

// Primitive crittografiche dell'app. Tutto quello che è segreto passa da qui.
//
// - cifra/decifra: AES-256-GCM con chiave da TRANSACTIONS_ENC_KEY (64 hex).
//   Usato per i segreti TOTP degli operatori e per i segreti HMAC delle chiavi
//   API. Il formato è "v1:<iv hex>:<tag hex>:<testo hex>" così un domani si
//   può ruotare l'algoritmo senza indovinare cosa c'è dentro.
// - hashPassword: PBKDF2-SHA256 a 210.000 giri (raccomandazione OWASP 2023 per
//   PBKDF2-HMAC-SHA256). Niente bcrypt/argon2: sono dipendenze native che su
//   Vercel vanno compilate, e questo basta per un'app interna.
// - confrontaSicuro: confronto a tempo costante, per non far trapelare da
//   quanto ci mette la risposta quanti caratteri erano giusti.

const VERSIONE = "v1";

function chiaveCifratura(): Buffer {
  const raw = (process.env.TRANSACTIONS_ENC_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      "TRANSACTIONS_ENC_KEY mancante o non valida: servono 64 caratteri esadecimali (npm run segreti).",
    );
  }
  return Buffer.from(raw, "hex");
}

/** true se l'app è configurata per cifrare (usato per mostrare un avviso in UI). */
export function cifraturaPronta(): boolean {
  return /^[0-9a-fA-F]{64}$/.test((process.env.TRANSACTIONS_ENC_KEY ?? "").trim());
}

export function cifra(testo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chiaveCifratura(), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return [VERSIONE, iv.toString("hex"), c.getAuthTag().toString("hex"), dati.toString("hex")].join(":");
}

export function decifra(pacchetto: string): string {
  const parti = pacchetto.split(":");
  if (parti.length !== 4 || parti[0] !== VERSIONE) {
    throw new Error("Testo cifrato in un formato che non riconosco.");
  }
  const [, ivHex, tagHex, datiHex] = parti;
  const d = createDecipheriv("aes-256-gcm", chiaveCifratura(), Buffer.from(ivHex, "hex"));
  d.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([d.update(Buffer.from(datiHex, "hex")), d.final()]).toString("utf8");
}

export function sha256(testo: string): string {
  return createHash("sha256").update(testo).digest("hex");
}

export function hmacSha256(segreto: string, messaggio: string): string {
  return createHmac("sha256", segreto).update(messaggio).digest("hex");
}

export function confrontaSicuro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const GIRI_PBKDF2 = 210_000;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const h = pbkdf2Sync(password, s, GIRI_PBKDF2, 32, "sha256").toString("hex");
  return { hash: h, salt: s };
}

export function passwordCorretta(password: string, hash: string, salt: string): boolean {
  const calcolato = pbkdf2Sync(password, salt, GIRI_PBKDF2, 32, "sha256").toString("hex");
  return confrontaSicuro(calcolato, hash);
}

/** Token casuale leggibile, per chiavi API e cookie di sessione. */
export function tokenCasuale(byte = 32): string {
  return randomBytes(byte).toString("base64url");
}
