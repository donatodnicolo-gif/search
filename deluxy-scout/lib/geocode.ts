// Geocoding lato client: chiama l'Edge Function `geocode` (proxy sicuro verso
// Google Geocoding + Places). Le chiavi Google NON sono nel bundle: vivono come
// secret server.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

export interface Predizione {
  description: string;
  place_id: string;
}

function geocodeUrl(): string {
  // Deriva dall'URL Supabase: <supabaseUrl>/functions/v1/geocode
  return `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/geocode`;
}

async function call<T>(body: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(geocodeUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Geocoding fallito (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* corpo non JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Converte un indirizzo/zona in coordinate. */
export function geocodeIndirizzo(address: string): Promise<GeocodeResult> {
  return call<GeocodeResult>({ action: 'geocode', address });
}

/** Suggerimenti Google mentre l'utente digita (min 3 caratteri lato server). */
export async function autocompleteIndirizzo(input: string): Promise<Predizione[]> {
  const r = await call<{ predictions: Predizione[] }>({ action: 'autocomplete', input });
  return r.predictions ?? [];
}

/** Coordinate di un suggerimento scelto (place_id → lat/lng). */
export function dettagliLuogo(placeId: string): Promise<GeocodeResult> {
  return call<GeocodeResult>({ action: 'details', place_id: placeId });
}
