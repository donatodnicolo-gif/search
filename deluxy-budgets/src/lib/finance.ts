// Client dell'API Finance (deluxy-partner): importi reali fatturati per
// tipologia di servizio, da affiancare al budget come consuntivo.
//
// La chiave è la stessa di /api/verifiche di Finance ed è un SEGRETO: vive solo
// in .env (FINANCE_API_KEY), mai committata. L'URL base è configurabile
// (FINANCE_API_URL) e in mancanza punta alla produzione.

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

export function financeConfigurato(): boolean {
  return Boolean(process.env.FINANCE_API_KEY);
}

export async function fetchConsuntivo(f: FiltroConsuntivo): Promise<ConsuntivoResult> {
  const key = process.env.FINANCE_API_KEY;
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
      cache: "no-store",
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
