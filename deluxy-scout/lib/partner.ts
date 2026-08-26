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
    const simili = Array.isArray(payload?.candidati) ? payload.candidati : [];
    // ⚠️ «Partner non trovato.» e basta non dice cosa fare, ed è quello che
    // l'utente ha visto il 26/08/2026. Due casi diversi, due frasi diverse:
    // se ci sono nomi simili è probabile che sia scritto in un altro modo; se
    // non ce n'è nessuno, quel cliente in FINANCE non esiste ancora e va
    // creato di là — è lui il padrone delle anagrafiche che fattura.
    const coda = simili.length
      ? ` In FINANCE ci sono nomi simili: ${simili.join(', ')} — probabilmente è scritto in un altro modo.`
      : /non trovato/i.test(String(dettaglio))
        ? ' Questo cliente in FINANCE non esiste ancora: va creato di là (o cambia il nome della richiesta con quello con cui è registrato), poi si riprova.'
        : '';
    throw new Error(`${dettaglio}${coda}`);
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

/**
 * Il PREVENTIVO al cliente (26/08/2026): l'offerta che precede la pro-forma.
 *
 * Stesso ponte, documento diverso: FINANCE lo numera PV n/anno e lo tiene in
 * bozza — l'invio al cliente resta un'azione di là, che è dove vive il
 * documento. Qui si tiene solo il riferimento.
 *
 * ⚠️ L'importo che si scrive nella richiesta è quello che il cliente PAGA (IVA
 * inclusa): al documento va l'imponibile, o l'IVA verrebbe aggiunta due volte.
 */
export async function creaPreventivoDaRichiesta(r: {
  cliente: string;
  importo: number;
  causale?: string | null;
  validoFino?: string | null;
}): Promise<ProformaCreata> {
  const descrizione = r.causale?.trim() || `Preventivo ${r.cliente}`;
  const imponibile = Math.round((r.importo / 1.22) * 100) / 100;
  return chiama<ProformaCreata>({
    azione: 'crea',
    tipo: 'preventivo',
    partner: r.cliente,
    oggetto: descrizione,
    validoFino: r.validoFino ?? undefined,
    righe: [{ descrizione, prezzoUnitario: imponibile, aliquotaIva: 22 }],
  });
}

/** L'esito del preventivo: lo decide il cliente, non noi. */
export async function esitoPreventivo(numero: string, stato: 'accettata' | 'rifiutata'): Promise<void> {
  await chiama({ azione: 'esito_preventivo', numero, stato });
}

/**
 * CHIUDE L'ORDINE su FINANCE: il lavoro è finito, si chiede la fattura.
 *
 * Due passi in uno, perché è così che va nella realtà: se il documento non
 * c'è ancora si emette adesso la pro-forma, poi la si conferma — che di là
 * vuol dire «andata a fattura».
 *
 * ⚠️ Torna il riferimento del documento, che va salvato SULL'ORDINE: senza,
 * domani nessuno sa quale fattura è quella di questo lavoro.
 */
export async function chiediFatturaPerOrdine(o: {
  cliente: string;
  importo: number;
  causale?: string | null;
  proformaNumero?: string | null;
  fatturaNumero?: string | null;
}): Promise<{ riferimento: string; url: string; fatturaNumero: string | null }> {
  let riferimento = o.proformaNumero ?? '';
  let url = '';
  if (!riferimento) {
    const pf = await creaProformaDaRichiesta({ cliente: o.cliente, importo: o.importo, causale: o.causale });
    riferimento = pf.riferimento;
    url = pf.url;
  }
  // `conferma` è idempotente di là: se era già fatturata risponde 200 con un
  // avviso, non un errore. Chiudere due volte non rompe niente.
  const esito = await chiama<{ riferimento?: string; url?: string; fatturaNumero?: string | null }>({
    azione: 'conferma',
    numero: riferimento,
    fatturaNumero: o.fatturaNumero ?? undefined,
  });
  return {
    riferimento: esito.riferimento ?? riferimento,
    url: esito.url ?? url,
    fatturaNumero: esito.fatturaNumero ?? null,
  };
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
