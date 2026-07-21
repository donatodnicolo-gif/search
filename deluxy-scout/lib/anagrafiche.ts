// Lettura LIVE dal registro Deluxy Anagrafiche (fonte di verità), tramite la
// Edge Function proxy `anagrafiche` che custodisce la chiave server-side.
// Regola d'oro del registro: leggere da qui, non duplicare.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface ContattoRegistro {
  ruolo: string | null;
  nome: string | null;
  telefono: string | null;
  email: string | null;
}

export interface PartnerRegistro {
  id: string;
  nome: string;
  categoria: string | null;
  stato: string | null;
  interessi: string[];
  citta: string | null;
  provincia: string | null;
  indirizzo: string | null;
  email: string | null;
  telefono: string | null;
  account: string | null;
  ultimaVisita: string | null;
  note: string | null;
  contatti: ContattoRegistro[];
}

async function chiama<T>(body: unknown): Promise<T> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/anagrafiche`;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Registro anagrafiche ${res.status}`);
  return (await res.json()) as T;
}

function normalizza(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '').trim();
}

/**
 * Comunica ad Anagrafiche l'archiviazione (o il ripristino) di un REFERENTE.
 * Best-effort: identifica il partner col riferimento esterno di Scout (place_id)
 * e il referente per email/telefono/nome; il registro segna il referente come
 * archiviato. Inerte finché Anagrafiche non espone l'endpoint + chiave scrittura
 * (la Edge Function risponde { ok:false, reason:'non_configurato' } senza errori).
 */
export async function notificaArchiviazioneReferente(dati: {
  placeId: string;
  nome: string;
  email: string | null;
  telefono: string | null;
  negozio: string | null;
  citta: string | null;
  archiviato: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await chiama<{ ok: boolean; reason?: string }>({ action: 'archivia_referente', ...dati });
  } catch {
    // Non blocca l'archiviazione locale: si potrà risincronizzare più avanti.
    return { ok: false, reason: 'non_raggiungibile' };
  }
}

/**
 * Sincronizza un NEGOZIO Scout verso il registro come partner (crea o aggiorna
 * stato/interessi, upsert-merge per riferimento esterno scout+placeId). Best-effort:
 * inerte finché Anagrafiche non abilita la scrittura partner per Scout (secret
 * ANAGRAFICHE_PARTNER_KEY): la funzione risponde { ok:false } senza far fallire nulla.
 */
export async function sincronizzaNegozioRegistro(dati: {
  placeId: string;
  nome: string;
  citta: string | null;
  indirizzo: string | null;
  categoria: string | null;
  stato: string | null; // StatoPlace: da_visitare/visitato/cliente/perso
  statoRegistro?: string | null; // StatoAffiliazione (8 stati) — se presente ha priorità
  linee: string[];
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    return await chiama<{ ok: boolean; reason?: string }>({ action: 'upsert_partner', ...dati });
  } catch {
    return { ok: false, reason: 'non_raggiungibile' };
  }
}

/**
 * Cerca nel registro il partner corrispondente a un negozio (per nome, con la
 * città come contesto). Ritorna la corrispondenza per nome normalizzato, o la
 * prima se non c'è un match esatto (con confidenza bassa lato UI).
 */
export async function cercaAnagrafica(
  nome: string,
  citta?: string | null,
): Promise<{ partner: PartnerRegistro | null; esatto: boolean }> {
  if (!nome.trim()) return { partner: null, esatto: false };
  const risposta = await chiama<{ dati?: PartnerRegistro[] }>({
    action: 'cerca',
    q: nome,
    citta: citta ?? undefined,
    perPage: 10,
  });
  const dati = risposta.dati ?? [];
  if (!dati.length) return { partner: null, esatto: false };
  const target = normalizza(nome);
  const esatto = dati.find((p) => normalizza(p.nome) === target);
  return { partner: esatto ?? dati[0], esatto: Boolean(esatto) };
}
