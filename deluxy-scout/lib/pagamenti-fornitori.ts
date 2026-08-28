// Pagamenti ai FORNITORI (28/08/2026): il verso OPPOSTO di `richieste_pagamento`
// (che è l'incasso dal cliente). Qui NOI dobbiamo pagare il fioraio, il
// catering, l'allestitore di un evento/ordine Scout.
//
// Scout NON paga: CHIEDE. La richiesta parte — via Edge Function `transactions`,
// che custodisce chiave e segreto server-side — verso DELUXY TRANSACTIONS,
// l'unica app da cui può uscire denaro (Standard Deluxy §7). Di là una persona
// autorizza e paga; l'esito torna sul webhook `transactions-esito` e aggiorna
// lo specchio locale (`trx_stato`), rileggibile live con `statoPagamentoFornitore`.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface RichiestaPagamentoFornitore {
  id: string;
  creato_il: string;
  creato_da: string | null;
  beneficiario: string;
  metodo: 'iban' | 'link' | 'paypal' | 'carta' | 'altro';
  iban: string;
  riferimento_pagamento: string;
  importo: number;
  causale: string;
  ordine_id: string | null;
  lavoro_id: string | null;
  note: string;
  trx_riferimento: string | null;
  trx_stato: string;
  trx_pagato_con: string;
  trx_pagata_il: string | null;
  esito_invio: string;
  inviata_il: string | null;
  aggiornata_il: string;
}

export const METODI_FORNITORE: Record<string, string> = {
  iban: 'Bonifico (IBAN)',
  link: 'Link di pagamento',
  paypal: 'PayPal',
  carta: 'Carta da remoto',
  altro: 'Altro accordo',
};

export async function fetchPagamentiFornitori(): Promise<RichiestaPagamentoFornitore[]> {
  const { data, error } = await supabase
    .from('richieste_pagamento_fornitore')
    .select('*')
    .order('creato_il', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, importo: Number(r.importo) })) as RichiestaPagamentoFornitore[];
}

export async function inserisciPagamentoFornitore(r: {
  beneficiario: string;
  metodo: string;
  iban?: string;
  riferimento_pagamento?: string;
  importo: number;
  causale: string;
  ordine_id?: string | null;
  note?: string;
}): Promise<RichiestaPagamentoFornitore> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('richieste_pagamento_fornitore')
    .insert({
      beneficiario: r.beneficiario.trim(),
      metodo: r.metodo,
      iban: (r.iban ?? '').replace(/\s+/g, '').toUpperCase(),
      riferimento_pagamento: (r.riferimento_pagamento ?? '').trim(),
      importo: r.importo,
      causale: r.causale.trim(),
      ordine_id: r.ordine_id ?? null,
      note: (r.note ?? '').trim(),
      creato_da: u.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, importo: Number(data.importo) } as RichiestaPagamentoFornitore;
}

async function chiamaTransactions<T>(body: unknown): Promise<T> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/transactions`;
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
    throw new Error('servizio pagamenti non raggiungibile (connessione assente o funzione non attiva).');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(payload?.error ?? payload?.errore ?? `HTTP ${res.status}`));
  return payload as T;
}

/** Inoltra la richiesta a Transactions (idempotente: rimandarla non la duplica). */
export async function inviaPagamentoFornitore(richiestaId: string): Promise<{ trx_riferimento: string; trx_stato: string }> {
  return chiamaTransactions({ azione: 'crea', richiesta_id: richiestaId });
}

/** Rilegge lo stato LIVE da Transactions (lo specchio locale può invecchiare). */
export async function statoPagamentoFornitore(richiestaId: string): Promise<{ trovata: boolean; trx_stato?: string }> {
  return chiamaTransactions({ azione: 'stato', richiesta_id: richiestaId });
}

export interface EstrattoPagamento {
  dati: { iban: string; intestatario: string; importo: number; valuta: string; causale: string };
  ibanValido: boolean;
  fornitore: string;
}

/** Lettura AI (testo o foto della richiesta del fornitore): PROPONE, non salva. */
export async function estraiPagamentoFornitore(input: {
  testo?: string;
  immagine?: { dati: string; tipo: string };
}): Promise<EstrattoPagamento> {
  return chiamaTransactions({ azione: 'estrai', ...input });
}
