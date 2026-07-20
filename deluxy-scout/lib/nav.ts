// Costruzione di URL di navigazione Google Maps (indicazioni stradali).
// Nessuna dipendenza: apribili con Linking.openURL su Android/iOS/web.
import type { Coord } from '@/lib/location';

const BASE = 'https://www.google.com/maps/dir/?api=1';

// L'URL API di Google Maps accetta al massimo 9 waypoint intermedi
// (oltre a origine e destinazione). Oltre, le tappe eccedenti vanno escluse.
export const MAX_WAYPOINTS = 9;

function fmt(c: Coord): string {
  return `${c.lat},${c.lng}`;
}

/** URL verso una singola destinazione (opzionalmente da un'origine). */
export function urlNavigazione(dest: Coord, origine?: Coord | null): string {
  const params: string[] = [];
  if (origine) params.push(`origin=${fmt(origine)}`);
  params.push(`destination=${fmt(dest)}`);
  params.push('travelmode=driving');
  return `${BASE}&${params.join('&')}`;
}

export interface GiroNav {
  url: string;
  /** Quante tappe entrano effettivamente nel percorso navigabile. */
  tappeIncluse: number;
  /** True se alcune tappe finali sono state escluse per il limite di Google. */
  troncato: boolean;
}

/**
 * URL per navigare un intero giro: origine → waypoint… → destinazione.
 * La destinazione è l'ultima tappa inclusa; le precedenti sono waypoint.
 * Ritorna null se non c'è almeno una tappa.
 */
export function urlNavigazioneGiro(partenza: Coord | null, tappe: Coord[]): GiroNav | null {
  if (tappe.length === 0) return null;

  // origine (opzionale) + fino a MAX_WAYPOINTS waypoint + 1 destinazione.
  const massimo = MAX_WAYPOINTS + 1;
  const incluse = tappe.slice(0, massimo);
  const troncato = tappe.length > incluse.length;

  const destinazione = incluse[incluse.length - 1];
  const waypoints = incluse.slice(0, -1);

  const params: string[] = [];
  if (partenza) params.push(`origin=${fmt(partenza)}`);
  params.push(`destination=${fmt(destinazione)}`);
  if (waypoints.length) {
    // Il separatore tra waypoint (|) va codificato per compatibilità Android.
    params.push(`waypoints=${waypoints.map(fmt).join('%7C')}`);
  }
  params.push('travelmode=driving');

  return { url: `${BASE}&${params.join('&')}`, tappeIncluse: incluse.length, troncato };
}
