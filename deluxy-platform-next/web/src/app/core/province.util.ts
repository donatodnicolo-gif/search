import { Province } from './models';

/**
 * Deduce la provincia da un indirizzo testuale: cerca un codice provincia
 * (es. "(MI)"), un nome provincia oppure una città nota.
 * Nell'app reale la provincia è geocodificata via Google Maps.
 */
/**
 * La provincia da un indirizzo. Il segnale AUTOREVOLE è il **codice a 2 lettere**
 * (es. «… 20124 Milano MI») che sta in coda, dopo la città — non i nomi dentro
 * la via: «Corso Como» a Milano non è Como, «Via Ferrara» a Carpi non è Ferrara,
 * «Piazza Duca d'Aosta» a Milano non è Aosta.
 *
 * ⚠️ Perciò: 1) si cerca il CODICE a due lettere, e si tiene quello più a DESTRA
 * (il codice provincia sta alla fine; uno che spunta prima è un caso). Il codice
 * non deve essere seguito da lettera o cifra, così «SP146» (strada provinciale)
 * non passa per La Spezia. 2) SOLO se non c'è nessun codice si ripiega sui nomi
 * di provincia/città (fragile).
 */
export function detectProvince(address: string, provinces: Province[]): Province | null {
  const a = (address ?? '').trim();
  if (!a) return null;
  // 1) Codice a 2 lettere, quello più a destra.
  let best: Province | null = null;
  let bestPos = -1;
  for (const p of provinces) {
    const re = new RegExp(`(^|[^A-Za-z])(${p.code})(?![A-Za-z0-9])`, 'g');
    let m: RegExpExecArray | null;
    let last = -1;
    while ((m = re.exec(a)) !== null) last = m.index + m[1].length;
    if (last > bestPos) { bestPos = last; best = p; }
  }
  if (best) return best;
  // 2) Ripiego: nome provincia/città nella stringa.
  const lower = a.toLowerCase();
  for (const p of provinces) {
    if (p.name && lower.includes(p.name.toLowerCase())) return p;
    for (const c of p.cities ?? []) {
      if (c.name && lower.includes(c.name.toLowerCase())) return p;
    }
  }
  return null;
}
