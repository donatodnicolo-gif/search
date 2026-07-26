import { createHmac, randomBytes } from "crypto";

// TOTP (RFC 6238) scritto a mano: sono trenta righe e evita una dipendenza in
// più su un'app che maneggia pagamenti. Compatibile con Google Authenticator,
// 1Password, Authy: SHA-1, 6 cifre, finestra di 30 secondi.

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // base32 RFC 4648

export function generaSegretoTotp(): string {
  const b = randomBytes(20);
  let bit = 0;
  let valore = 0;
  let out = "";
  for (const byte of b) {
    valore = (valore << 8) | byte;
    bit += 8;
    while (bit >= 5) {
      out += ALFABETO[(valore >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ALFABETO[(valore << (5 - bit)) & 31];
  return out;
}

function daBase32(segreto: string): Buffer {
  const pulito = segreto.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bit = 0;
  let valore = 0;
  const byte: number[] = [];
  for (const ch of pulito) {
    const i = ALFABETO.indexOf(ch);
    if (i === -1) continue;
    valore = (valore << 5) | i;
    bit += 5;
    if (bit >= 8) {
      byte.push((valore >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(byte);
}

function codiceAlPasso(segreto: string, passo: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(passo / 2 ** 32), 0);
  buf.writeUInt32BE(passo >>> 0, 4);
  const h = createHmac("sha1", daBase32(segreto)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * Verifica il codice a 6 cifre. Tolleranza di ±1 passo (30 secondi) per gli
 * orologi che vanno un po' avanti o indietro: più di così aprirebbe la finestra
 * a un riuso del codice.
 */
export function codiceTotpValido(segreto: string, codice: string, adesso = Date.now()): boolean {
  const c = codice.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const passo = Math.floor(adesso / 30_000);
  for (const delta of [0, -1, 1]) {
    if (codiceAlPasso(segreto, passo + delta) === c) return true;
  }
  return false;
}

/** URI otpauth:// da dare all'app di autenticazione (QR o copia-incolla). */
export function uriTotp(segreto: string, email: string): string {
  const etichetta = encodeURIComponent(`Deluxy Transactions:${email}`);
  return `otpauth://totp/${etichetta}?secret=${segreto}&issuer=Deluxy%20Transactions&algorithm=SHA1&digits=6&period=30`;
}
