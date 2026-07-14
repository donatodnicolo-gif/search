// Geocoding lato client: chiama l'Edge Function `geocode` (proxy sicuro verso
// Google Geocoding). La chiave Google NON è nel bundle: vive come secret server.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

function geocodeUrl(): string {
  // Deriva dall'URL Supabase: <supabaseUrl>/functions/v1/geocode
  return `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/geocode`;
}

/** Converte un indirizzo/zona in coordinate. Lancia un errore leggibile se fallisce. */
export async function geocodeIndirizzo(address: string): Promise<GeocodeResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(geocodeUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ address }),
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
  return (await res.json()) as GeocodeResult;
}
