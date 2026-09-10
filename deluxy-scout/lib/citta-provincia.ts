// CITTÀ E PROVINCIA DI UN NEGOZIO DI SCOUT (10/09/2026, richiesta dell'utente:
// «aggiungi come colonne città, provincia»).
//
// Scout tiene la città in `zona` e l'indirizzo intero in `indirizzo`
// («Via Italo Bargagna, 12, 20100 Milano MI»); la provincia non ha una colonna
// sua. Si ricava, in quest'ordine: la sigla in coda all'indirizzo (dopo CAP e
// città), poi la città stessa se è un capoluogo (`siglaProvincia`). Se non
// si sa, resta vuota: meglio un vuoto che una provincia indovinata.
import { PROVINCIA_PER_SIGLA, siglaProvincia } from '@/lib/province';

export function cittaEProvincia(p: { zona?: string | null; indirizzo?: string | null }): { citta: string | null; provincia: string | null } {
  const indirizzo = (p.indirizzo ?? '').trim();
  const zona = (p.zona ?? '').trim();
  // «…, 20100 Milano MI» / «…, 20100 Milano MI, Italia» / «… Milano (MI)».
  let provincia: string | null = null;
  const conParentesi = indirizzo.match(/\(([A-Za-z]{2})\)/);
  const inCoda = indirizzo.replace(/,?\s*(Italia|Italy)\s*$/i, '').match(/\b([A-Za-z]{2})\s*$/);
  for (const m of [conParentesi, inCoda]) {
    const s = m?.[1]?.toUpperCase();
    if (s && PROVINCIA_PER_SIGLA.has(s)) {
      provincia = s;
      break;
    }
  }
  // La città: `zona` se c'è; altrimenti quello che sta fra il CAP e la sigla.
  let citta: string | null = zona || null;
  if (!citta) {
    const m = indirizzo.match(/\b\d{5}\s+([^,]+?)\s*(?:\([A-Za-z]{2}\)|\b[A-Za-z]{2})?\s*(?:,\s*(?:Italia|Italy))?\s*$/i);
    if (m) citta = m[1].trim() || null;
  }
  if (!provincia && citta) provincia = siglaProvincia(citta);
  return { citta, provincia };
}
