// Assistente AI che riassume lo stato della pipeline (Edge Function
// `assistente-trattative`). Il client invia le trattative già filtrate e
// unificate: il riassunto rispecchia esattamente ciò che l'utente vede.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { TrattativaConLuogo } from '@/lib/db';

export interface RiepilogoTrattative {
  disponibile: boolean;
  vuoto?: boolean;
  reason?: string; // 'ai_non_configurata' se manca la chiave AI
  aggregati?: {
    aperte: number;
    vinte: number;
    perse: number;
    in_ritardo: number;
    valore_aperto_txt: string;
    valore_vinto_txt: string;
  };
  sintesi?: string;
  azioni?: string[];
  attenzione?: string[];
}

export async function riepilogoTrattative(
  trattative: TrattativaConLuogo[],
  contesto?: string,
): Promise<RiepilogoTrattative> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/assistente-trattative`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const compatte = trattative.map((d) => ({
    negozio: d.place_nome,
    fase: d.fase,
    valore: d.valore_atteso,
    linea: d.linee?.length ? d.linee.join(', ') : d.linea,
    scadenza: d.scadenza ?? null,
    next_action: d.next_action ?? null,
    owner_nome: d.owner_nome ?? null,
  }));

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ trattative: compatte, contesto: contesto ?? '' }),
    });
  } catch {
    throw new Error('Assistente non raggiungibile.');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
  return payload as RiepilogoTrattative;
}
