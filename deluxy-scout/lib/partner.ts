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
 * ⚠️⚠️ L'IMPORTO È SEMPRE IVA ESCLUSA (28/08/2026, regola dell'utente:
 * «il valore passato risulta lordo con iva mentre la regola è sempre che sarà
 * con iva da aggiungere»).
 *
 * Fino a oggi qui si SCORPORAVA (importo / 1,22): la convenzione era nata
 * sulle richieste clienti, dove il prezzo detto al telefono è quello che il
 * cliente paga. Ma gli ordini registrano il valore NETTO — e passando di qui
 * un ordine da 3.500 € produceva un documento da 2.868,85 + IVA = 3.500
 * lordi: l'imponibile sbagliato, e nessun errore a schermo. La regola adesso
 * è UNA per tutta l'app: quello che si scrive è l'imponibile, l'IVA la
 * aggiunge il documento.
 */
export async function creaProformaDaRichiesta(r: {
  cliente: string;
  importo: number;
  causale?: string | null;
  scadenza?: string | null;
  /** La nota che finisce SUL documento (es. i termini dell'acconto). */
  note?: string | null;
  /**
   * Con quale INTESTAZIONE emetterla (27/08/2026): FINANCE tiene un template
   * per brand — logo, dati societari, coordinate di pagamento. Si passa il
   * brand per nome («cakedesign.me»), non un codice interno. Senza, di là si
   * usa il template predefinito.
   */
  brand?: string | null;
  /**
   * ⚠️ NON c'è più un campo `intestazione` (27/08/2026, revisione di
   * sicurezza). La carta intestata — logo, ragione sociale, IBAN — la risolve
   * la Edge Function dal template del BRAND, perché FINANCE la congela sul
   * documento: accettarla da chi chiama voleva dire lasciargli scegliere le
   * coordinate su cui il cliente bonifica. Qui si manda il brand, e basta.
   */
}): Promise<ProformaCreata> {
  const descrizione = r.causale?.trim() || `Incasso ${r.cliente}`;
  // L'importo È l'imponibile: niente scorporo (vedi sopra).
  return chiama<ProformaCreata>({
    azione: 'crea',
    partner: r.cliente,
    oggetto: descrizione,
    scadenza: r.scadenza ?? undefined,
    note: r.note ?? undefined,
    brand: r.brand ?? undefined,
    righe: [{ descrizione, prezzoUnitario: r.importo, aliquotaIva: 22 }],
  });
}

/**
 * Il PREVENTIVO al cliente (26/08/2026): l'offerta che precede la pro-forma.
 *
 * Stesso ponte, documento diverso: FINANCE lo numera PV n/anno e lo tiene in
 * bozza — l'invio al cliente resta un'azione di là, che è dove vive il
 * documento. Qui si tiene solo il riferimento.
 *
 * ⚠️⚠️ Anche qui l'importo è IVA ESCLUSA (28/08/2026, stessa regola della
 * pro-forma qui sopra): è l'imponibile, e l'IVA la aggiunge il documento.
 */
export async function creaPreventivoDaRichiesta(r: {
  cliente: string;
  importo: number;
  causale?: string | null;
  validoFino?: string | null;
}): Promise<ProformaCreata> {
  const descrizione = r.causale?.trim() || `Preventivo ${r.cliente}`;
  // L'importo È l'imponibile: niente scorporo (stessa regola della pro-forma).
  return chiama<ProformaCreata>({
    azione: 'crea',
    tipo: 'preventivo',
    partner: r.cliente,
    oggetto: descrizione,
    validoFino: r.validoFino ?? undefined,
    righe: [{ descrizione, prezzoUnitario: r.importo, aliquotaIva: 22 }],
  });
}

/** Il documento come lo dà FINANCE: righe, totali e date — per la stampa. */
export interface DocumentoProforma {
  id: string;
  tipo: 'proforma' | 'preventivo';
  riferimento: string;
  partner: { id: string; nome: string } | null;
  data: string | null;
  scadenza: string | null;
  oggetto: string | null;
  note: string | null;
  stato: string;
  fatturaNumero: string | null;
  righe: { descrizione: string; quantita: number; prezzoUnitario: number; aliquotaIva: number; importo: number }[];
  imponibile: number;
  iva: number;
  totale: number;
  url: string | null;
}

/**
 * ⭐ I DATI di un documento già emesso (28/08/2026): servono alla copia
 * stampabile dentro Scout — la pagina di FINANCE è dietro login, e chi deve
 * solo scaricare non deve entrarci.
 */
export async function documentoProforma(numero: string, tipo?: 'preventivo'): Promise<DocumentoProforma> {
  return chiama<DocumentoProforma>({ azione: 'documento', numero, tipo });
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

/**
 * Una fattura già emessa, cercata per numero su FINANCE.
 *
 * ⚠️ Serve a VERIFICARE prima di agganciare: scrivere un numero di fattura
 * sull'ordine senza controllare che esista vorrebbe dire dichiararlo fatturato
 * con un riferimento inventato — e non se ne accorgerebbe nessuno finché
 * qualcuno non va a cercare quella fattura.
 */
export interface FatturaTrovata {
  trovata: boolean;
  numero?: string | null;
  id?: string | null;
  partner?: { id: string; nome: string } | null;
  imponibile?: number | null;
  totale?: number | null;
  pagata?: boolean;
  scaduta?: boolean;
  dataPagamento?: string | null;
  motivo?: string | null;
}

/** Una riga dell'elenco: quello che serve a riconoscere la fattura giusta. */
export interface FatturaInElenco {
  id: string;
  numero: string | null;
  partner: { id: string; nome: string } | null;
  tipologia: string | null;
  anno: number;
  mese: number;
  emissione: string | null;
  imponibile: number;
  aliquotaIva: number;
  totale: number;
  pagata: boolean;
  /** Su quale numero ha fatto match la ricerca per importo: totale o imponibile. */
  combacia: 'totale' | 'imponibile' | null;
  /** Il PDF del documento su Fatture in Cloud. ⚠️ FINANCE lo mandava già
   *  (`url: f.urlDettaglio`) e qui si buttava via perché il tipo non lo
   *  dichiarava: senza, la fattura agganciata non si poteva più aprire. */
  url?: string | null;
}

/**
 * Cerca le fatture di un cliente, per nome e/o importo.
 *
 * ⚠️ Torna un ELENCO da far guardare, non «la» fattura: il nome di un cliente
 * somiglia a quello di un altro, e l'importo di due ordini dello stesso mese
 * può coincidere. Sceglie una persona.
 *
 * ⚠️ Zero risultati non è un errore: è la risposta. Va distinta da «il servizio
 * non risponde», o la schermata mostra un rosso dove doveva dire «non c'è,
 * emettila».
 */
export async function cercaFatture(q: {
  cliente?: string | null;
  importo?: number | null;
  numero?: string | null;
  anno?: number | null;
  /** `invoice` (default) o `receipt`: due elenchi diversi su FIC. */
  tipo?: 'invoice' | 'receipt';
}): Promise<{ ok: boolean; fatture: FatturaInElenco[]; errore?: string; nota?: string | null }> {
  try {
    const r = await chiama<{ trovate: number; fatture: FatturaInElenco[]; nota?: string | null }>({
      azione: 'cerca_fatture',
      cliente: q.cliente ?? undefined,
      importo: q.importo ?? undefined,
      numero: q.numero ?? undefined,
      anno: q.anno ?? undefined,
      tipo: q.tipo ?? undefined,
    });
    return { ok: true, fatture: r?.fatture ?? [], nota: r?.nota ?? null };
  } catch (e: any) {
    const m = String(e?.message ?? e);
    // Il 404 della rotta assente va detto per quello che è: FINANCE non è
    // ancora aggiornato, non «non ci sono fatture».
    if (/404|not found/i.test(m)) {
      return { ok: false, fatture: [], errore: 'La ricerca fatture non è ancora disponibile su FINANCE.' };
    }
    return { ok: false, fatture: [], errore: m };
  }
}

export async function cercaFattura(numero: string): Promise<FatturaTrovata> {
  try {
    const r = await chiama<FatturaTrovata>({ azione: 'cerca_fattura', numero });
    return r ?? { trovata: false, motivo: 'Nessuna risposta da FINANCE.' };
  } catch (e: any) {
    // Il 404 di FINANCE arriva qui come errore: «non trovata» non è un guasto,
    // è la risposta — e va detta come tale, o la schermata mostra un rosso che
    // sembra un problema dell'app.
    const m = String(e?.message ?? e);
    return { trovata: false, motivo: /404|non trovat/i.test(m) ? 'Nessuna fattura con questo numero.' : m };
  }
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

/** L'esito del giro degli incassi (azione `incassi` della Edge `proforma`). */
export interface EsitoIncassi {
  controllati: number;
  aggiornati: number;
  richieste_cliente: number;
  richieste_pagamento: number;
  ordini: number;
  /** I casi che una PERSONA deve guardare: documento di un altro intestatario,
   *  o saldato per meno di quanto vale la riga (un acconto). */
  da_guardare: string[];
  errori: string[];
}

/**
 * Chiede a FINANCE quali documenti sono stati saldati e aggiorna le righe di
 * Scout (richieste clienti, richieste di pagamento, ordini).
 *
 * ⚠️ Lo stesso giro gira ogni notte alle 05:30 (cron `incassi-da-finance`,
 * migr. 0109): questo bottone serve a non aspettare domani, non a sostituirlo.
 * ⚠️ L'esito NON si ingoia: `da_guardare` sono i casi in cui il documento
 * risulta pagato ma qualcosa non torna — intestatario diverso, o importo che
 * copre solo una parte. Vanno mostrati, o restano invisibili come lo era
 * l'incasso prima.
 */
export async function aggiornaIncassiDaFinance(): Promise<EsitoIncassi> {
  return chiama<EsitoIncassi>({ azione: 'incassi' });
}
