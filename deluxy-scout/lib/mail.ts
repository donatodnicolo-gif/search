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

export interface OpzioniMail {
  da?: string; // ISO: inizio finestra (default: 30 giorni fa)
  a?: string; // ISO: fine finestra (default: ora)
  server?: boolean; // cerca anche sul server IMAP (lento): usare in background
  limite?: number;
}

/**
 * Mail ricevute dal contatto in una finestra temporale (default: ultimi 30
 * giorni). Con `server:false` è veloce (solo DB locale); con `server:true`
 * interroga anche il server IMAP (lento). Tollerante: ritorna [] su errore.
 */
export async function mailDaContatto(email: string, opts: OpzioniMail = {}): Promise<MailMessaggio[]> {
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
      body: JSON.stringify({
        azione: 'messaggi',
        email: email.trim(),
        da: opts.da,
        a: opts.a,
        server: opts.server ? 1 : undefined,
        limite: opts.limite ?? 30,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) return [];
    return (payload.messaggi ?? []) as MailMessaggio[];
  } catch {
    return [];
  }
}

/**
 * Importa in «Richieste Web» la posta arrivata alla casella commerciale
 * (secret MAIL_CASELLA_RICHIESTE su Supabase, default commerciale@deluxy.it).
 * Ogni mail non ancora importata diventa un lead di fonte "mail"; il dedup è
 * sul Message-ID, quindi si può rilanciare quante volte si vuole.
 */
export async function importaRichiesteDaMail(limite = 50): Promise<{ lette: number; importate: number }> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/mail`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ azione: 'richieste', limite }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.errore ?? `Importazione non riuscita (${res.status}).`);
  }
  return { lette: Number(payload.lette ?? 0), importate: Number(payload.importate ?? 0) };
}
