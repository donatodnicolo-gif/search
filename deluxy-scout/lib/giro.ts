// Pianificazione del "giro": ordina le tappe per priorità e poi per prossimità.
// Condiviso tra la mappa nativa (mappa.tsx) e la vista web (mappa.web.tsx).
import type { Place } from '@/types';
import type { Coord } from '@/lib/location';

/**
 * Ordina per priorità (P1>P2>P3) e, dentro ciascun livello, costruisce un
 * percorso greedy nearest-neighbor a partire dalla posizione di partenza.
 * Non "salta" mai un P1 per un P2 più vicino: la priorità viene prima.
 */
export function ordinaGiro(places: Place[], partenza: Coord): Place[] {
  const restanti = [...places];
  const percorso: Place[] = [];
  let corrente = partenza;
  for (const livello of ['P1', 'P2', 'P3'] as const) {
    const pool = restanti.filter((p) => p.priorita === livello);
    while (pool.length) {
      pool.sort((a, b) => dist(corrente, a) - dist(corrente, b));
      const prossimo = pool.shift()!;
      percorso.push(prossimo);
      corrente = { lat: prossimo.lat, lng: prossimo.lng };
    }
  }
  return percorso;
}

/** Distanza al quadrato: sufficiente per ordinare (evita la radice). */
function dist(a: Coord, b: { lat: number; lng: number }): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}
