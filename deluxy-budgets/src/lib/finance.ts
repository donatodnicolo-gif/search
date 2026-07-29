// Client dell'API Finance (deluxy-partner): importi reali fatturati per
// tipologia di servizio, da affiancare al budget come consuntivo.
//
// La chiave è la stessa di /api/verifiche di Finance ed è un SEGRETO: vive solo
// in .env (FINANCE_API_KEY), mai committata. L'URL base è configurabile
// (FINANCE_API_URL) e in mancanza punta alla produzione.

import { RIVALIDA } from "./cache";
import { chiave } from "./chiavi";

const BASE = process.env.FINANCE_API_URL ?? "https://deluxy-partner.vercel.app";

export type ConsuntivoTipologia = {
  tipologia: string;
  imponibile: number; // netto IVA
  iva: number;
  totale: number; // IVA inclusa
  fatture: number;
  quota: number; // % sul totale del periodo
};

export type Consuntivo = {
  anno: number;
  periodo: { dal: number; al: number; etichetta: string };
  stato: string;
  tipologie: ConsuntivoTipologia[];
  totali: { imponibile: number; iva: number; totale: number; fatture: number };
};

export type ConsuntivoResult =
  | { ok: true; dati: Consuntivo }
  | { ok: false; errore: string; configurato: boolean };

export type FiltroConsuntivo = {
  anno: number;
  mese?: number | null;
  dal?: number;
  al?: number;
  stato?: "tutte" | "pagate" | "aperte";
};

export async function financeConfigurato(): Promise<boolean> {
  return Boolean(await chiave("FINANCE_API_KEY"));
}

// ---------- Spese bancarie (addebiti) per il CFO ----------

export type SpesaControparte = {
  controparte: string;
  uscite: number;
  movimenti: number;
  quota: number;
  perMese: number[]; // 12 valori
};

export type SpeseBanca = {
  anno: number;
  periodo: { dal: number; al: number; etichetta: string };
  controparti: SpesaControparte[];
  totali: { uscite: number; movimenti: number; perMese: number[] };
};

export type SpeseResult =
  | { ok: true; dati: SpeseBanca }
  | { ok: false; errore: string; configurato: boolean };

export async function fetchSpeseBanca(f: {
  anno: number;
  dal?: number;
  al?: number;
  mese?: number | null;
  includiIgnorate?: boolean;
}): Promise<SpeseResult> {
  const key = await chiave("FINANCE_API_KEY");
  if (!key) {
    return {
      ok: false,
      configurato: false,
      errore: "Chiave Finance non configurata. Imposta FINANCE_API_KEY nel file .env.",
    };
  }
  const qs = new URLSearchParams({ anno: String(f.anno) });
  if (f.mese) qs.set("mese", String(f.mese));
  else {
    if (f.dal) qs.set("dal", String(f.dal));
    if (f.al) qs.set("al", String(f.al));
  }
  if (f.includiIgnorate) qs.set("stato", "tutte");

  try {
    const res = await fetch(`${BASE}/api/spese?${qs.toString()}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (res.status === 401) {
      return { ok: false, configurato: true, errore: "Chiave Finance non valida (401): controlla FINANCE_API_KEY." };
    }
    if (res.status === 404) {
      return {
        ok: false,
        configurato: true,
        errore: "Endpoint /api/spese non ancora disponibile su Finance: va deployata la nuova versione.",
      };
    }
    if (!res.ok) return { ok: false, configurato: true, errore: `Finance ha risposto ${res.status}.` };
    const dati = (await res.json()) as SpeseBanca;
    if (!Array.isArray(dati?.controparti)) {
      return { ok: false, configurato: true, errore: "Risposta di Finance non riconosciuta." };
    }
    return { ok: true, dati };
  } catch {
    return { ok: false, configurato: true, errore: "Finance non raggiungibile: riprova più tardi." };
  }
}

// ---------- I movimenti di una controparte, uno per uno ----------
//
// L'aggregato dice quanto e in che mese; questo dice **quando** e **con quale
// causale**. Servono tutti e due: la causale è il criterio con cui si decide
// cosa sia un pagamento (un numero d'ordine = fioraio di quell'ordine, un mese =
// rimborso del valet), e la data è quello che serve per spostare un importo su
// un altro esercizio senza indovinare.

export type MovimentoBanca = {
  data: string; // AAAA-MM-GG
  importo: number;
  descrizione: string | null;
  categoria: string | null;
};

export type MovimentiResult =
  | { ok: true; movimenti: MovimentoBanca[]; totale: number }
  | { ok: false; errore: string };

export async function fetchMovimenti(f: {
  anno: number;
  dal: number;
  al: number;
  controparte: string;
}): Promise<MovimentiResult> {
  const key = await chiave("FINANCE_API_KEY");
  if (!key) return { ok: false, errore: "Chiave Finance non configurata." };
  const qs = new URLSearchParams({
    anno: String(f.anno),
    dal: String(f.dal),
    al: String(f.al),
    controparte: f.controparte,
  });
  try {
    const res = await fetch(`${BASE}/api/spese?${qs.toString()}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false, errore: `Finance ha risposto ${res.status}.` };
    const dati = (await res.json()) as { movimenti?: MovimentoBanca[]; totale?: number };
    if (!Array.isArray(dati?.movimenti)) {
      // Finance non ha ancora la versione che espone i movimenti: si dice, invece
      // di mostrare una lista vuota che sembrerebbe «nessun movimento».
      return { ok: false, errore: "Questa versione di Finance non espone i singoli movimenti (serve il deploy con ?controparte=)." };
    }
    return { ok: true, movimenti: dati.movimenti, totale: dati.totale ?? 0 };
  } catch {
    return { ok: false, errore: "Finance non raggiungibile." };
  }
}

// ---------- Il fatturato dell'anno, mese per mese, in UNA chiamata ----------
//
// Il conto economico mensile ha bisogno dei dodici mesi. Chiedendoli uno per
// uno erano **dodici viaggi di rete** a ogni caricamento di pagina, in serie
// con tutto il resto: è stata la cosa più lenta dell'app. Finance ora sa
// raggruppare per mese; se risponde con la vecchia forma si torna alle dodici
// chiamate, invece di mostrare una tabella vuota.

export type FatturatoMensile = { tipologia: string; mesi: number[]; imponibile: number };

export async function fetchConsuntivoMensile(f: {
  anno: number;
  dal: number;
  al: number;
  stato?: "tutte" | "pagate" | "aperte";
}): Promise<{ ok: true; tipologie: FatturatoMensile[] } | { ok: false }> {
  const key = await chiave("FINANCE_API_KEY");
  if (!key) return { ok: false };
  const qs = new URLSearchParams({
    anno: String(f.anno),
    dal: String(f.dal),
    al: String(f.al),
    raggruppa: "mese",
  });
  if (f.stato && f.stato !== "tutte") qs.set("stato", f.stato);
  try {
    const res = await fetch(`${BASE}/api/tipologie?${qs.toString()}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false };
    const dati = (await res.json()) as { tipologie?: { tipologia: string; mesi?: number[]; imponibile: number }[] };
    const righe = dati?.tipologie;
    // La vecchia versione risponde con le stesse chiavi ma **senza** `mesi`:
    // accorgersene qui evita di sommare dodici zeri e chiamarlo consuntivo.
    if (!Array.isArray(righe) || righe.some((t) => !Array.isArray(t.mesi))) return { ok: false };
    return { ok: true, tipologie: righe as FatturatoMensile[] };
  } catch {
    return { ok: false };
  }
}

// ---------- Le fatture di una tipologia, una per una ----------
// Simmetrico ai movimenti di banca: il totale per tipologia dice quanto, non
// **di chi**. Chi guarda un ricavo che non torna ha bisogno delle fatture.

export type FatturaTipologia = {
  numero: string | null;
  mese: number;
  emissione: string | null;
  partner: string | null;
  imponibile: number;
  totale: number;
  pagata: boolean;
  descrizione: string | null;
};

export type FattureResult =
  | { ok: true; fatture: FatturaTipologia[]; totale: number }
  | { ok: false; errore: string };

export async function fetchFatture(f: {
  anno: number;
  dal: number;
  al: number;
  tipologia: string;
}): Promise<FattureResult> {
  const key = await chiave("FINANCE_API_KEY");
  if (!key) return { ok: false, errore: "Chiave Finance non configurata." };
  const qs = new URLSearchParams({
    anno: String(f.anno),
    dal: String(f.dal),
    al: String(f.al),
    tipologia: f.tipologia,
  });
  try {
    const res = await fetch(`${BASE}/api/tipologie?${qs.toString()}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false, errore: `Finance ha risposto ${res.status}.` };
    const dati = (await res.json()) as { fatture?: FatturaTipologia[]; totale?: number };
    if (!Array.isArray(dati?.fatture)) {
      return { ok: false, errore: "Questa versione di Finance non espone le singole fatture (serve il deploy con ?tipologia=)." };
    }
    return { ok: true, fatture: dati.fatture, totale: dati.totale ?? 0 };
  } catch {
    return { ok: false, errore: "Finance non raggiungibile." };
  }
}

export async function fetchConsuntivo(f: FiltroConsuntivo): Promise<ConsuntivoResult> {
  const key = await chiave("FINANCE_API_KEY");
  if (!key) {
    return {
      ok: false,
      configurato: false,
      errore:
        "Chiave Finance non configurata. Imposta FINANCE_API_KEY (e opzionalmente FINANCE_API_URL) nel file .env.",
    };
  }

  const qs = new URLSearchParams({ anno: String(f.anno) });
  if (f.mese) qs.set("mese", String(f.mese));
  else {
    if (f.dal) qs.set("dal", String(f.dal));
    if (f.al) qs.set("al", String(f.al));
  }
  if (f.stato && f.stato !== "tutte") qs.set("stato", f.stato);

  try {
    const res = await fetch(`${BASE}/api/tipologie?${qs.toString()}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (res.status === 401) {
      return { ok: false, configurato: true, errore: "Chiave Finance non valida (401): controlla FINANCE_API_KEY." };
    }
    if (!res.ok) {
      return { ok: false, configurato: true, errore: `Finance ha risposto ${res.status}.` };
    }
    const dati = (await res.json()) as Consuntivo;
    if (!Array.isArray(dati?.tipologie)) {
      return { ok: false, configurato: true, errore: "Risposta di Finance non riconosciuta." };
    }
    return { ok: true, dati };
  } catch {
    return { ok: false, configurato: true, errore: "Finance non raggiungibile: riprova più tardi." };
  }
}
