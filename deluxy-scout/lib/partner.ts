// Integrazione con Deluxy Partner (finanza): creazione e conferma pro-forma
// tramite la Edge Function proxy `proforma`, che custodisce la chiave API
// server-side (mai nel bundle dell'app).
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export interface ProformaCreata {
  id: string;
  riferimento: string; // es. "PF 2/2026"
  stato: string;
  totale: number;
  url: string; // pagina del documento su deluxy-partner
}

async function chiama<T>(body: unknown): Promise<T> {
  const url = `${env.supabaseUrl().replace(/\/$/, '')}/functions/v1/proforma`;
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
    // Errore di rete/CORS: il browser non dà dettagli ("Failed to fetch").
    throw new Error('servizio pro-forma non raggiungibile (connessione assente o servizio non attivo).');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const dettaglio = payload?.errore ?? payload?.error ?? `HTTP ${res.status}`;
    const candidati = Array.isArray(payload?.candidati) && payload.candidati.length
      ? ` Partner simili nel registro: ${payload.candidati.join(', ')}.`
      : '';
    throw new Error(`${dettaglio}${candidati}`);
  }
  return payload as T;
}

/**
 * Crea una pro-forma su Deluxy Partner a partire da una richiesta di pagamento.
 * L'importo richiesto al cliente è inteso IVA INCLUSA: qui si scorpora
 * l'imponibile (aliquota 22%) così il totale della pro-forma coincide.
 */
export async function creaProformaDaRichiesta(r: {
  cliente: string;
  importo: number;
  causale?: string | null;
  scadenza?: string | null;
}): Promise<ProformaCreata> {
  const descrizione = r.causale?.trim() || `Incasso ${r.cliente}`;
  const imponibile = Math.round((r.importo / 1.22) * 100) / 100;
  return chiama<ProformaCreata>({
    azione: 'crea',
    partner: r.cliente,
    oggetto: descrizione,
    scadenza: r.scadenza ?? undefined,
    righe: [{ descrizione, prezzoUnitario: imponibile, aliquotaIva: 22 }],
  });
}

/** Conferma il pagamento della pro-forma collegata (→ stato "fatturata"). */
export async function confermaPagamentoProforma(numero: string): Promise<void> {
  await chiama({ azione: 'conferma', numero });
}

// ── Riepilogo finanziario del cliente (fatturato + andamento) da FINANCE ────────

// Forma reale della risposta di /api/riepilogo-finanziario di Deluxy Partner.
export interface RiepilogoFinanziario {
  partner: { id: string; nome: string } | null;
  anno: number;
  annoPrec: number;
  base?: string; // descrizione dell'aggregato (es. "vendite vendor + servizi fatturati")
  fonte?: 'fic' | string; // "fic" = dato dedotto dalle fatture su Fatture in Cloud
  fatturato: number; // anno corrente (year-to-date)
  fatturatoPrec: number; // stesso periodo anno precedente
  variazionePct: number | null; // % vs anno precedente
  mesi: number[]; // 12 valori, indice 0 = gennaio
  mesiPrec?: number[];
  anni?: { anno: number; totale: number; fatture: number }[]; // riepilogo per anno (fallback FIC, 3 anni)
  url?: string; // pagina del partner su deluxy-partner
}

/**
 * Chiede a Deluxy Partner (FINANCE) quanto sta facendo un cliente: fatturato
 * dell'anno + andamento mensile. Tollerante: ritorna null se il cliente non è
 * nel FINANCE (404) o l'endpoint non è raggiungibile — la UI non mostra la card.
 */
export async function riepilogoFinanziario(cliente: string): Promise<RiepilogoFinanziario | null> {
  try {
    const r = await chiama<RiepilogoFinanziario>({ azione: 'riepilogo', partner: cliente });
    return r && r.fatturato != null ? r : null;
  } catch {
    return null;
  }
}
