// Chi ha smesso di fatturare — dal FINANCE (deluxy-partner), via la Edge
// Function proxy `finance` che custodisce la chiave lato server.
//
// Serve al livello DORMIENTE (lib/livelli.ts). La definizione è «cliente che
// non sta fatturando», e il fatturato Scout non ce l'ha: vive in Finance.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface ClienteFinance {
  /** id del registro Anagrafiche: è il ponte con `places.anagrafiche_id`. */
  anagraficaId: string | null;
  nome: string;
  /** «Dismesso» secondo i MOVIMENTI reali, con le regole di Finance. */
  nonFattura: boolean;
  /** Quando è stato l'ultimo movimento: dice da quanto è fermo. */
  ultimoMovimento: string | null;
}

export interface EsitoFinance {
  clienti: ClienteFinance[];
  /** false = Finance non è collegato: il dato non c'è, non è «nessuno fermo». */
  collegato: boolean;
}

/**
 * Lo stato di analisi di tutti i clienti.
 *
 * ⚠️ Si guarda `calcolato` **prima** di `codice`. `codice` è quello scritto a
 * mano nella scheda partner, `calcolato` è quello che risulta dai movimenti:
 * la domanda qui è «sta fatturando?», che è un fatto, non una classificazione.
 * Quando i due divergono Finance lo segnala (`discordante`) — e il fatto vince.
 *
 * Tollerante per scelta: se Finance non risponde torna `collegato: false` e
 * nessun cliente. Chi legge deve poter distinguere «non ci sono dormienti» da
 * «non lo sappiamo», che è il genere di confusione che fa sparire una lista
 * senza che nessuno se ne accorga.
 */
export async function fetchClientiFinance(): Promise<EsitoFinance> {
  const vuoto: EsitoFinance = { clienti: [], collegato: false };
  try {
    const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/finance`;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabaseAnonKey(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: 'stato_clienti' }),
    });
    if (!res.ok) return vuoto;
    const j = await res.json();
    if (j?.ok === false || !Array.isArray(j?.clienti)) return vuoto;

    const clienti: ClienteFinance[] = j.clienti.map((c: any) => {
      const a = c.statoAnalisi ?? {};
      const dismesso = (v: unknown) => String(v ?? '').trim().toLowerCase() === 'dismesso';
      return {
        anagraficaId: c.partner?.anagraficaId ?? null,
        nome: c.partner?.nome ?? '',
        nonFattura: dismesso(a.calcolato) || dismesso(a.codice),
        ultimoMovimento: a.ultimoMovimento ?? null,
      };
    });
    return { clienti, collegato: true };
  } catch {
    return vuoto;
  }
}

/**
 * Gli `anagrafiche_id` dei clienti che non fatturano più.
 *
 * Il ponte fra le due app è l'id del registro Anagrafiche, non il nome: i nomi
 * si scrivono in dieci modi e un match approssimativo qui vorrebbe dire
 * dichiarare dormiente il cliente sbagliato.
 */
export async function fetchNonFatturano(): Promise<{ ids: Set<string>; collegato: boolean }> {
  const { clienti, collegato } = await fetchClientiFinance();
  const ids = new Set<string>();
  for (const c of clienti) if (c.nonFattura && c.anagraficaId) ids.add(c.anagraficaId);
  return { ids, collegato };
}
