// Client HubSpot lato app.
//
// IMPORTANTE (sicurezza): l'app NON parla direttamente con l'API HubSpot, perché
// il Private App token non deve mai finire nel bundle. L'app chiama la Supabase
// Edge Function `hubspot-sync` (vedi supabase/functions/hubspot-sync/index.ts),
// che custodisce il token come secret server-side ed espone azioni ad alto livello:
//   - sync_visit  → upsert Company + Contact, crea Deal, scrive la Nota
//   - deals_for_place → sync inverso: fasi/valori dei deal aperti su HubSpot
//
// La mappatura verso HubSpot (companies/contacts/deals/notes, dealstage) è
// implementata dentro la Edge Function.
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Deal, Visit } from '@/types';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function callSync<T>(action: string, body: unknown): Promise<T> {
  const url = env.hubspotSyncUrl();
  if (!url) throw new Error('HUBSPOT_SYNC_URL non configurato');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ action, ...(body as object) }),
  });
  if (res.status === 429) {
    // Rate limit: segnala al chiamante (la coda gestisce il retry con backoff).
    const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HubSpot sync ${action} fallita (${res.status}): ${txt}`);
  }
  return (await res.json()) as T;
}

export class RateLimitError extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(`HubSpot rate limit — riprova tra ${retryAfterSec}s`);
    this.retryAfterSec = retryAfterSec;
    this.name = 'RateLimitError';
  }
}

export interface SyncVisitResult {
  hubspot_company_id: string;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string;
  note_id: string | null;
}

/**
 * Sincronizza una visita: crea/aggiorna Company+Contact, crea Deal (linea→proprietà,
 * fase→dealstage) e scrive Briefing/Note post meeting/Esito e analisi come Nota.
 * Ritorna gli id HubSpot generati.
 */
export function syncVisita(visitId: string): Promise<SyncVisitResult> {
  return callSync<SyncVisitResult>('sync_visit', { visit_id: visitId });
}

/** Sync inverso: deal aperti su HubSpot per un place (fase + valore). */
export function dealsPerPlace(placeId: string): Promise<Deal[]> {
  return callSync<Deal[]>('deals_for_place', { place_id: placeId });
}

/** Utile per un eventuale re-sync manuale a partire dai dati locali. */
export function syncVisitaPayload(visit: Visit): Promise<SyncVisitResult> {
  return callSync<SyncVisitResult>('sync_visit', { visit_id: visit.id });
}
