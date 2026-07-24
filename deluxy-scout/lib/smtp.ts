// Configurazione della casella email personale del venditore (Register.it),
// da cui l'app invia notifiche e promemoria per suo conto. Passa dalla Edge
// Function `smtp-config`: la password viaggia una sola volta in salita, viene
// cifrata server-side e non torna mai indietro.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

async function chiama<T>(body: unknown): Promise<T> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/smtp-config`;
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
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Servizio email non raggiungibile.');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
  return payload as T;
}

export interface StatoSmtp {
  configurato: boolean;
  utente: string | null;
  verificato_il: string | null;
}

export function statoSmtp(): Promise<StatoSmtp> {
  return chiama<StatoSmtp>({ azione: 'stato' });
}

export function salvaSmtp(cfg: {
  host: string;
  porta: number;
  utente: string;
  password: string;
  mittente?: string;
}): Promise<{ ok: boolean }> {
  return chiama({ azione: 'salva', ...cfg });
}

/** Invia un'email di prova alla propria casella per confermare le credenziali. */
export function verificaSmtp(): Promise<{ ok: boolean; reason?: string; dettaglio?: string; inviata_a?: string; host?: string }> {
  return chiama({ azione: 'verifica' });
}

export function rimuoviSmtp(): Promise<{ ok: boolean }> {
  return chiama({ azione: 'rimuovi' });
}
