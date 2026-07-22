// Filtro città uniforme in tutto il progetto: invece di elencare tutte le zone,
// si scelgono le principali (Milano, Roma, Firenze), "Altre" (tutto il resto) e
// "Tutte" (nessun filtro). `zona` sui negozi contiene la città (es. "MILANO").

export type BucketCitta = 'Milano' | 'Roma' | 'Firenze' | 'Altre';

// Opzioni mostrate nei filtri, nell'ordine richiesto.
export const OPZIONI_CITTA: (BucketCitta | 'Tutte')[] = ['Milano', 'Roma', 'Firenze', 'Altre', 'Tutte'];

/** Classifica una zona/città in uno dei bucket principali o "Altre". */
export function bucketCitta(zona: string | null | undefined): BucketCitta {
  const z = (zona ?? '').trim().toLowerCase();
  if (z.includes('milano')) return 'Milano';
  if (z.includes('roma')) return 'Roma';
  if (z.includes('firenze')) return 'Firenze';
  return 'Altre';
}

/** Il negozio passa il filtro città scelto? `null` o "Tutte" = passa sempre. */
export function passaFiltroCitta(zona: string | null | undefined, filtro: string | null): boolean {
  if (!filtro || filtro === 'Tutte') return true;
  return bucketCitta(zona) === filtro;
}
