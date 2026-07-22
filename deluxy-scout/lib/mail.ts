// Integrazione con AI Mail (deluxy-mail): le ultime mail ricevute da un contatto,
// tramite la Edge Function proxy `mail` che custodisce la chiave server-side.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface MailMessaggio {
  id: string;
  da: string; // nome mittente (o email)
  email: string;
  oggetto: string;
  data: string; // ISO
  anteprima: string;
  letto: boolean;
  allegati: number;
}

/**
 * Ultime mail ricevute dal contatto (per la scheda cliente). Tollerante: ritorna
 * [] se AI Mail non è raggiungibile, la casella non ha quel mittente, o l'utente
 * Scout non ha una casella su AI Mail.
 */
export async function mailDaContatto(email: string, limite = 10): Promise<MailMessaggio[]> {
  if (!email.trim()) return [];
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/mail`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ azione: 'messaggi', email: email.trim(), limite }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) return [];
    return (payload.messaggi ?? []) as MailMessaggio[];
  } catch {
    return [];
  }
}
