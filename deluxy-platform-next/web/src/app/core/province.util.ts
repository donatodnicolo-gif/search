import { Province } from './models';

/**
 * Deduce la provincia da un indirizzo testuale: cerca un codice provincia
 * (es. "(MI)"), un nome provincia oppure una città nota.
 * Nell'app reale la provincia è geocodificata via Google Maps.
 */
export function detectProvince(address: string, provinces: Province[]): Province | null {
  const a = (address ?? '').trim();
  if (!a) return null;
  const lower = a.toLowerCase();
  for (const p of provinces) {
    const codeRe = new RegExp(`(^|[^A-Za-z])${p.code}([^A-Za-z]|$)`);
    if (codeRe.test(a)) return p;
    if (p.name && lower.includes(p.name.toLowerCase())) return p;
    for (const c of p.cities ?? []) {
      if (c.name && lower.includes(c.name.toLowerCase())) return p;
    }
  }
  return null;
}
