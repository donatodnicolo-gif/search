// IBAN: normalizzazione, checksum mod-97 (ISO 7064) e lunghezza per paese.
// Un IBAN sbagliato scoperto qui è un bonifico non partito; scoperto in banca è
// una segnalazione e una settimana di rincorse.

const LUNGHEZZE: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27,
  MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24,
  RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

// Area SEPA: fuori da qui il bonifico non è un SEPA Credit Transfer e la
// distinta va preparata diversamente. Serve al calcolo del rischio.
const SEPA = new Set([
  "AD", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC",
  "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "SM", "VA",
]);

export function normalizzaIban(iban: string): string {
  return iban.replace(/[\s-]/g, "").toUpperCase();
}

export function formattaIban(iban: string): string {
  return normalizzaIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

export function paeseIban(iban: string): string {
  return normalizzaIban(iban).slice(0, 2);
}

export function ibanSepa(iban: string): boolean {
  return SEPA.has(paeseIban(iban));
}

/** Checksum ISO 7064 mod-97: l'unico controllo che dice davvero se è scritto bene. */
export function ibanValido(iban: string): boolean {
  const v = normalizzaIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(v)) return false;
  const attesa = LUNGHEZZE[v.slice(0, 2)];
  if (!attesa || v.length !== attesa) return false;
  const riordinato = v.slice(4) + v.slice(0, 4);
  // mod 97 a blocchi, perché il numero intero sfonderebbe il Number di JS
  let resto = 0;
  for (const ch of riordinato) {
    const n = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    for (const cifra of n) resto = (resto * 10 + Number(cifra)) % 97;
  }
  return resto === 1;
}

export function bicValido(bic: string): boolean {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic.replace(/\s/g, "").toUpperCase());
}

/** Nome ridotto a una forma confrontabile: serve a capire se è lo stesso beneficiario. */
export function normalizzaNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // toglie gli accenti
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|srls|ltd|gmbh|sa|bv)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Mostra solo la coda dell'IBAN, per i log e le notifiche. */
export function ibanMascherato(iban: string): string {
  const v = normalizzaIban(iban);
  if (v.length < 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
