// Geolocalizzazione: permessi + posizione corrente + distanza (Haversine).
import * as Location from 'expo-location';

export interface Coord {
  lat: number;
  lng: number;
}

/** Chiede il permesso e ritorna true se concesso. */
export async function richiediPermessoPosizione(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Posizione corrente, o null se permesso negato / errore. */
export async function posizioneCorrente(): Promise<Coord | null> {
  try {
    const ok = await richiediPermessoPosizione();
    if (!ok) return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** Distanza in km tra due coordinate (formula dell'emisenoverso / Haversine). */
export function distanzaKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = deg2rad(b.lat - a.lat);
  const dLng = deg2rad(b.lng - a.lng);
  const lat1 = deg2rad(a.lat);
  const lat2 = deg2rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

// Centro mappa di default: Duomo di Milano.
export const MILANO: Coord = { lat: 45.4642, lng: 9.19 };
