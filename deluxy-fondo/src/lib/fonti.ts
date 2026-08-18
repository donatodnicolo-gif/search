/**
 * Deluxy Fondo — accesso alle fonti dati esterne.
 *
 * Le fonti sono state provate sul campo (vedi docs/analisi/03-fonti-dati.md):
 * qui ci sono solo quelle che hanno realmente risposto. Le altre (Stooq, Alpha Vantage,
 * Twelve Data, FMP, EODHD con token demo, RSS di Borsa Italiana) NON funzionano e non
 * vanno reintrodotte senza riprovarle.
 *
 * Regola: ogni funzione restituisce ANCHE lo stato della fonte. Se una fonte cade, il
 * chiamante deve poter dire «questo dato non c'è» invece di mostrare un valore vecchio
 * come se fosse fresco.
 */

import type { Barra, Fonte, SerieStorica, StatoFonte } from "./tipi";

const UA = "Mozilla/5.0 (compatible; DeluxyFondo/0.1; ricerca finanziaria)";

/** Scarica con timeout esplicito: una fonte che non risponde non deve bloccare il giro. */
async function prendi(url: string, timeoutMs = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "*/*" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

function oggiISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Prezzi — Yahoo Finance chart v8
// ---------------------------------------------------------------------------

export type EsitoSerie = {
  serie: SerieStorica | null;
  stato: StatoFonte;
};

/**
 * Serie storica giornaliera.
 *
 * Usa `adjclose` quando c'è (rettificato per dividendi e operazioni sul capitale) e
 * ricade su `close` quando manca, dichiarandolo nello stato. Le barre incomplete
 * (chiusura nulla) vengono scartate, non riempite: interpolare un prezzo è inventarlo.
 */
export async function scaricaSerie(
  simbolo: string,
  nome: string,
  intervallo: "1mo" | "1y" | "5y" | "10y" | "max" = "10y"
): Promise<EsitoSerie> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    simbolo
  )}?range=${intervallo}&interval=1d`;
  const stato: StatoFonte = {
    nome: `Yahoo chart — ${simbolo}`,
    descrizione: `Prezzi giornalieri di ${nome}`,
    url,
    esito: "mai-provata",
    messaggio: null,
    aggiornataIl: null,
    record: null,
  };

  try {
    const r = await prendi(url);
    if (!r.ok) {
      return { serie: null, stato: { ...stato, esito: "errore", messaggio: `HTTP ${r.status}`, aggiornataIl: oggiISO() } };
    }
    const j = (await r.json()) as any;
    if (j?.chart?.error) {
      return {
        serie: null,
        stato: { ...stato, esito: "errore", messaggio: String(j.chart.error.description ?? j.chart.error.code), aggiornataIl: oggiISO() },
      };
    }
    const res = j?.chart?.result?.[0];
    if (!res?.timestamp?.length) {
      return { serie: null, stato: { ...stato, esito: "errore", messaggio: "Risposta senza barre", aggiornataIl: oggiISO() } };
    }

    const q = res.indicators?.quote?.[0] ?? {};
    const adj: (number | null)[] | undefined = res.indicators?.adjclose?.[0]?.adjclose;
    const usaAdj = Array.isArray(adj) && adj.some((x) => typeof x === "number");

    const barre: Barra[] = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      const chiusura = usaAdj ? adj![i] : q.close?.[i];
      if (typeof chiusura !== "number" || !Number.isFinite(chiusura)) continue;
      // Con adjclose, anche OHLC va scalato dello stesso fattore per restare coerente.
      const fattore = usaAdj && typeof q.close?.[i] === "number" && q.close[i] !== 0 ? chiusura / q.close[i] : 1;
      barre.push({
        data: new Date(res.timestamp[i] * 1000).toISOString().slice(0, 10),
        apertura: typeof q.open?.[i] === "number" ? q.open[i] * fattore : null,
        massimo: typeof q.high?.[i] === "number" ? q.high[i] * fattore : null,
        minimo: typeof q.low?.[i] === "number" ? q.low[i] * fattore : null,
        chiusura,
        volume: typeof q.volume?.[i] === "number" ? q.volume[i] : null,
      });
    }

    return {
      serie: {
        simbolo: res.meta?.symbol ?? simbolo,
        nome,
        valuta: res.meta?.currency ?? "EUR",
        fonte: usaAdj ? "Yahoo chart v8 (adjclose)" : "Yahoo chart v8 (close grezzo)",
        scaricataIl: oggiISO(),
        barre,
      },
      stato: {
        ...stato,
        esito: "ok",
        messaggio: usaAdj ? null : "Nessun adjclose: serie NON rettificata per dividendi e operazioni sul capitale.",
        aggiornataIl: oggiISO(),
        record: barre.length,
      },
    };
  } catch (e) {
    return {
      serie: null,
      stato: { ...stato, esito: "errore", messaggio: e instanceof Error ? e.message : String(e), aggiornataIl: oggiISO() },
    };
  }
}

/**
 * Cerca salti di prezzo troppo grandi per essere di mercato: sono la firma di un
 * raggruppamento, di uno spin-off o di un cambio ISIN non rettificato.
 *
 * TIM ha fatto un raggruppamento 1:10 il 15/06/2026: se la serie non è rettificata,
 * un backtest ci legge un -90% che non è mai esistito. Meglio un avviso in faccia
 * che un numero sbagliato in silenzio.
 */
export function trovaDiscontinuita(
  serie: SerieStorica,
  sogliaRapporto = 2.5
): { data: string; precedente: number; successivo: number; rapporto: number }[] {
  const out: { data: string; precedente: number; successivo: number; rapporto: number }[] = [];
  for (let i = 1; i < serie.barre.length; i++) {
    const a = serie.barre[i - 1].chiusura;
    const b = serie.barre[i].chiusura;
    if (!a || !b) continue;
    const rapporto = b / a;
    if (rapporto >= sogliaRapporto || rapporto <= 1 / sogliaRapporto) {
      out.push({ data: serie.barre[i].data, precedente: a, successivo: b, rapporto });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fondamentali — Yahoo fundamentals-timeseries
// ---------------------------------------------------------------------------

const VOCI_FONDAMENTALI = [
  "annualTotalRevenue",
  "annualEBITDA",
  "annualNetIncome",
  "annualFreeCashFlow",
  "annualTotalDebt",
  "annualCashAndCashEquivalents",
  "annualStockholdersEquity",
  "annualCapitalExpenditure",
] as const;

export type ValoreAnnuale = { esercizio: number; fine: string; valuta: string; valore: number };
export type Fondamentali = Record<string, ValoreAnnuale[]>;

/**
 * Fondamentali annuali. Copre solo ~4 esercizi: per lo storico lungo servono i bilanci
 * (vedi docs/analisi/06-08). Restituisce solo quello che la fonte ha davvero dato.
 */
export async function scaricaFondamentali(simbolo: string): Promise<{ dati: Fondamentali; stato: StatoFonte }> {
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(simbolo)}` +
    `?symbol=${encodeURIComponent(simbolo)}&type=${VOCI_FONDAMENTALI.join(",")}` +
    `&period1=1400000000&period2=${Math.floor(Date.now() / 1000)}`;
  const stato: StatoFonte = {
    nome: `Yahoo fondamentali — ${simbolo}`,
    descrizione: "Ricavi, EBITDA, utile, FCF, debito annuali",
    url,
    esito: "mai-provata",
    messaggio: null,
    aggiornataIl: null,
    record: null,
  };

  try {
    const r = await prendi(url);
    if (!r.ok) {
      return { dati: {}, stato: { ...stato, esito: "errore", messaggio: `HTTP ${r.status}`, aggiornataIl: oggiISO() } };
    }
    const j = (await r.json()) as any;
    const righe: any[] = j?.timeseries?.result ?? [];
    const dati: Fondamentali = {};
    let conta = 0;
    for (const riga of righe) {
      const tipo = riga?.meta?.type?.[0];
      if (!tipo || !Array.isArray(riga[tipo])) continue;
      const valori: ValoreAnnuale[] = [];
      for (const v of riga[tipo]) {
        const grezzo = v?.reportedValue?.raw;
        if (typeof grezzo !== "number" || !v?.asOfDate) continue;
        valori.push({
          esercizio: Number(String(v.asOfDate).slice(0, 4)),
          fine: String(v.asOfDate),
          valuta: v?.currencyCode ?? "EUR",
          valore: grezzo,
        });
        conta++;
      }
      if (valori.length) dati[tipo] = valori.sort((a, b) => a.esercizio - b.esercizio);
    }
    return {
      dati,
      stato: {
        ...stato,
        esito: conta > 0 ? "ok" : "errore",
        messaggio: conta > 0 ? null : "Risposta valida ma senza valori.",
        aggiornataIl: oggiISO(),
        record: conta,
      },
    };
  } catch (e) {
    return { dati: {}, stato: { ...stato, esito: "errore", messaggio: e instanceof Error ? e.message : String(e), aggiornataIl: oggiISO() } };
  }
}

// ---------------------------------------------------------------------------
// Notizie — Google News RSS
// ---------------------------------------------------------------------------

export type Notizia = {
  titolo: string;
  url: string;
  editore: string | null;
  pubblicata: string | null;
  /** Parole di governance trovate nel titolo: serve solo a ORDINARE, non a concludere. */
  segnali: string[];
  /** Parole di operazione straordinaria (OPA, cessione, fusione): eventi di primo livello. */
  straordinarie: string[];
};

/**
 * Parole che segnalano un possibile evento di governance.
 * Attenzione: trovarle NON significa che l'evento sia avvenuto — un titolo di giornale
 * non è un fatto societario. Servono a mettere in cima le notizie da leggere a mano.
 */
export const PAROLE_GOVERNANCE = [
  "nomina",
  "nominato",
  "nominata",
  "cooptazione",
  "dimissioni",
  "si dimette",
  "revoca",
  "subentra",
  "nuovo amministratore delegato",
  "nuovo ceo",
  "amministratore delegato",
  "consiglio di amministrazione",
  "rinnovo del consiglio",
  "assemblea",
  "lista del cda",
  "direttore generale",
  "cfo",
  "presidente",
  "appoints",
  "steps down",
  "resigns",
  "succeeds",
  "interim ceo",
  "board reshuffle",
];

/**
 * Operazioni straordinarie: cambio di controllo, offerte, cessioni.
 *
 * Sono eventi di primo livello e, soprattutto, **contaminano** ogni misura sull'effetto di
 * un cambio di management: se nella stessa settimana arriva un'offerta, il movimento del
 * prezzo è dell'offerta. Vanno riconosciute proprio per poterle escludere.
 */
export const PAROLE_STRAORDINARIE = [
  "opa",
  "opas",
  "offerta pubblica",
  "adesioni",
  "delisting",
  "fusione",
  "scissione",
  "cessione",
  "acquisizione",
  "aumento di capitale",
  "raggruppamento",
  "profit warning",
  "piano industriale",
  "guidance",
  "takeover",
  "tender offer",
  "merger",
  "stake",
];

function testoTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Notizie da Google News RSS (massimo 100 item, nessuno storico).
 *
 * La query va costruita stretta: cercare solo «TIM» pesca «ACV nomina Tim Fox come CFO».
 * Chi chiama deve passare una query già disambiguata.
 */
export async function scaricaNotizie(query: string, etichetta: string): Promise<{ notizie: Notizia[]; stato: StatoFonte }> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=it&gl=IT&ceid=IT:it`;
  const stato: StatoFonte = {
    nome: `Google News — ${etichetta}`,
    descrizione: `Notizie per: ${query}`,
    url,
    esito: "mai-provata",
    messaggio: null,
    aggiornataIl: null,
    record: null,
  };

  try {
    const r = await prendi(url);
    if (!r.ok) {
      return { notizie: [], stato: { ...stato, esito: "errore", messaggio: `HTTP ${r.status}`, aggiornataIl: oggiISO() } };
    }
    const xml = await r.text();
    const blocchi = xml.split("<item>").slice(1);
    const notizie: Notizia[] = [];
    for (const b of blocchi) {
      const titolo = testoTag(b, "title");
      const link = testoTag(b, "link");
      if (!titolo || !link) continue;
      const minuscolo = titolo.toLowerCase();
      notizie.push({
        titolo,
        url: link,
        editore: testoTag(b, "source"),
        pubblicata: testoTag(b, "pubDate"),
        segnali: PAROLE_GOVERNANCE.filter((p) => minuscolo.includes(p)),
        straordinarie: PAROLE_STRAORDINARIE.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(minuscolo)),
      });
    }
    return {
      notizie,
      stato: { ...stato, esito: notizie.length ? "ok" : "errore", messaggio: notizie.length ? null : "Feed vuoto", aggiornataIl: oggiISO(), record: notizie.length },
    };
  } catch (e) {
    return { notizie: [], stato: { ...stato, esito: "errore", messaggio: e instanceof Error ? e.message : String(e), aggiornataIl: oggiISO() } };
  }
}

export const FONTI_DOCUMENTATE: Fonte[] = [
  { titolo: "Yahoo Finance — chart v8 (prezzi giornalieri)", url: "https://query1.finance.yahoo.com/v8/finance/chart/TIT.MI?range=10y&interval=1d", data: null },
  { titolo: "Yahoo Finance — fundamentals timeseries", url: "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/TIT.MI", data: null },
  { titolo: "Google News RSS", url: "https://news.google.com/rss/search", data: null },
  { titolo: "TIM — archivio comunicati stampa", url: "https://www.gruppotim.it/it/archivio-stampa.html", data: null },
  { titolo: "Consob — azionariato Telecom Italia", url: "https://www.consob.it/web/area-pubblica/w/telecom-italia-spa-azionariato", data: null },
  { titolo: "Borsa Italiana — scheda TIT (ISIN IT0005712671)", url: "https://www.borsaitaliana.it/borsa/azioni/scheda/IT0005712671.html", data: null },
  { titolo: "SEC EDGAR — Telecom Italia (CIK 948642), Form 20-F", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000948642&type=20-F", data: null },
];
