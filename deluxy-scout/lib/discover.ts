// Scoperta negozi sul territorio: chiama l'Edge Function `discover` (Google Places
// + cache). Ritorna le attività vicine, già classificate per linea Deluxy.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';

export interface ScopertaResult {
  places: Place[];
  cached: boolean; // true se serviti dalla cache (nessuna chiamata a Google)
  nuovi: number; // quanti negozi mai visti prima (badge "Novità")
}

function discoverUrl(): string {
  return `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/discover`;
}

export async function scopriNegozi(lat: number, lng: number, radius = 300): Promise<ScopertaResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(discoverUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: 'discover', lat, lng, radius }),
  });
  if (!res.ok) {
    let msg = `Scoperta fallita (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* corpo non JSON */
    }
    throw new Error(msg);
  }
  return (await res.json()) as ScopertaResult;
}
