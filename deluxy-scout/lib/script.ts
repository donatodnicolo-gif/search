// Sezione "Script": libreria dei testi email (prospezione, follow-up…) e invio
// a più contatti dalla casella personale del venditore (Edge Function `invio-email`).
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export type TipoScript = 'prospezione' | 'follow_up' | 'avviso' | 'altro';

export interface ScriptEmail {
  id: string;
  owner: string;
  titolo: string;
  tipo: TipoScript;
  oggetto: string | null;
  corpo: string;
  created_at: string;
  updated_at: string;
  owner_nome?: string | null;
}

export const LABEL_TIPO: Record<TipoScript, string> = {
  prospezione: 'Prospezione',
  follow_up: 'Follow-up',
  avviso: 'Avviso',
  altro: 'Altro',
};

/** Libreria condivisa dei modelli (tutti i venditori la leggono). */
export async function fetchScript(): Promise<ScriptEmail[]> {
  const { data, error } = await supabase.from('script_email').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScriptEmail[];
}

export async function salvaScript(s: {
  id?: string;
  titolo: string;
  tipo: TipoScript;
  oggetto: string | null;
  corpo: string;
}): Promise<void> {
  if (s.id) {
    const { error } = await supabase
      .from('script_email')
      .update({ titolo: s.titolo, tipo: s.tipo, oggetto: s.oggetto, corpo: s.corpo, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    if (error) throw error;
  } else {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('script_email')
      .insert({ owner: u.user?.id, titolo: s.titolo, tipo: s.tipo, oggetto: s.oggetto, corpo: s.corpo });
    if (error) throw error;
  }
}

export async function eliminaScript(id: string): Promise<void> {
  const { error } = await supabase.from('script_email').delete().eq('id', id);
  if (error) throw error;
}

/** Sostituisce i segnaposto per l'anteprima lato client (stessa logica del server). */
export function anteprima(testo: string, nome?: string | null, negozio?: string | null): string {
  return (testo ?? '')
    .replace(/\{nome\}/gi, (nome ?? '').trim() || 'Gentile cliente')
    .replace(/\{negozio\}/gi, (negozio ?? '').trim() || '');
}

export interface EsitoInvio {
  inviate: number;
  totale: number;
  falliti: { email: string; errore?: string }[];
  da?: string;
  reason?: string;
  error?: string;
}

/** Invia l'email a più destinatari dalla casella personale. */
export async function inviaEmailContatti(
  oggetto: string,
  corpo: string,
  destinatari: { email: string; nome?: string | null; negozio?: string | null }[],
): Promise<EsitoInvio> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/invio-email`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ oggetto, corpo, destinatari }),
    });
  } catch {
    throw new Error('Servizio di invio non raggiungibile.');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
  return payload as EsitoInvio;
}
