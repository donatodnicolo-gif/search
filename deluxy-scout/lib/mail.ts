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
export interface EsitoImportRichieste {
  lette: number;
  importate: number;
  /** Quante mail il filtro ha tenuto fuori perché non sono richieste. */
  scartate: number;
  /** Mandate da un robot (dominio di notifica, o local part tipo `noreply`). */
  automatiche: number;
  /** Mandate da un collega del nostro dominio. */
  interne: number;
  /** Gli indirizzi scartati (max 8): servono a vedere se il filtro taglia troppo. */
  mittentiScartati: string[];
  /** Auto-qualifica (25/08/2026): trattative nate su un contatto già in rubrica. */
  trattativeAgganciate: number;
  /** Trattative nate creando negozio e contatto dai dati della richiesta. */
  trattativeConNegozioNuovo: number;
  /** Richieste rimaste «nuove» in coda: le qualifica una persona. */
  rimasteInCoda: number;
  /** Registro Anagrafiche (26/08/2026): anagrafiche NATE con questo import. */
  anagraficheCreate: number;
  /** Anagrafiche che nel registro c'erano già: niente da creare. */
  anagraficheGiaPresenti: number;
  /** Anagrafiche che il registro NON ha preso: restano solo in Scout. */
  anagraficheNonScritte: number;
}

export async function importaRichiesteDaMail(limite = 50): Promise<EsitoImportRichieste> {
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
  return {
    lette: Number(payload.lette ?? 0),
    importate: Number(payload.importate ?? 0),
    scartate: Number(payload.scartate ?? 0),
    automatiche: Number(payload.automatiche ?? 0),
    interne: Number(payload.interne ?? 0),
    mittentiScartati: Array.isArray(payload.mittentiScartati) ? payload.mittentiScartati.map(String) : [],
    trattativeAgganciate: Number(payload.trattativeAgganciate ?? 0),
    trattativeConNegozioNuovo: Number(payload.trattativeConNegozioNuovo ?? 0),
    rimasteInCoda: Number(payload.rimasteInCoda ?? 0),
    anagraficheCreate: Number(payload.anagraficheCreate ?? 0),
    anagraficheGiaPresenti: Number(payload.anagraficheGiaPresenti ?? 0),
    anagraficheNonScritte: Number(payload.anagraficheNonScritte ?? 0),
  };
}

/** Il testo intero di una mail importata (si chiede solo quando si apre). */
export async function fetchCorpoMail(id: string): Promise<{ testo: string; oggetto: string | null }> {
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
    body: JSON.stringify({ azione: 'corpo', id }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) throw new Error(payload?.errore ?? 'Testo non disponibile.');
  return { testo: String(payload.messaggio?.testo ?? ''), oggetto: payload.messaggio?.oggetto ?? null };
}

export interface CasellaMail {
  email: string;
  nome: string | null;
  imapHost: string | null;
  cartella: string | null;
  /** L'email dell'UTENTE di AI Mail: è questo il valore da mettere in «Casella». */
  utente: string | null;
  attivo: boolean;
}

/** Le caselle che AI Mail ha davvero: servono a scegliere invece di indovinare. */
export async function fetchCaselleMail(): Promise<CasellaMail[]> {
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
    body: JSON.stringify({ azione: 'caselle' }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) throw new Error(payload?.errore ?? `Elenco caselle non riuscito (${res.status}).`);
  return (payload.caselle ?? []) as CasellaMail[];
}

export interface NuovaCasella {
  email: string;
  imapHost: string;
  imapPassword: string;
  imapPort?: number;
  imapUtente?: string;
  smtpHost?: string;
  smtpPort?: number;
  ignoraCertTls?: boolean;
}

/**
 * Collega una casella in AI Mail (utente + IMAP/SMTP).
 *
 * ⚠️ Scout **non conserva** queste credenziali: le manda ad AI Mail, che è
 * l'app padrona delle caselle e le cifra. Due app che custodiscono la stessa
 * password sono due posti da cui può uscire e due da aggiornare quando cambia.
 * AI Mail **prova la connessione prima di salvare**: se la password è sbagliata
 * torna un errore leggibile e non resta niente scritto a metà.
 */
export async function collegaCasellaMail(casella: NuovaCasella): Promise<{ casella: string; creato: boolean }> {
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
    body: JSON.stringify({ azione: 'collega_casella', casella }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    const dettaglio = payload?.suggerimento ? ` ${payload.suggerimento}` : '';
    throw new Error(`${payload?.errore ?? `Collegamento non riuscito (${res.status}).`}${dettaglio}`);
  }
  return { casella: String(payload.casella ?? casella.email), creato: Boolean(payload.creato) };
}
