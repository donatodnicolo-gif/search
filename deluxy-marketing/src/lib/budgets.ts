// **Il budget di vendita e il tetto ADV arrivano da deluxy-budgets.**
//
// Perché serve (01/08/2026): questa app teneva una **copia propria** del budget
// pubblicitario — la tabella `BudgetMensile`, importata a mano dal foglio
// «Budget adv» del Monitoraggio. Due copie della stessa cosa divergono sempre,
// e quando divergono le campagne si decidono sul numero sbagliato. Al momento
// di collegarle la copia locale si fermava a **agosto**: da settembre in poi
// Marketing non aveva nessun tetto di spesa, mentre Budgets sapeva già quanto
// si poteva spendere fino a dicembre.
//
// Chi comanda su cosa, ed è il motivo per cui le due cifre restano affiancate e
// non fuse:
//  - **Budgets** decide quanto una maison deve vendere in un mese e **quanto
//    può spendere in ADV** (`advConsentito` = vendite × % decisa in /spese).
//    È la fonte ufficiale, perché è l'app che fa il conto economico;
//  - **qui** il tetto si calcolava dal **ROS** (vendita prevista ÷ ritorno
//    atteso). È un altro modo di arrivare allo stesso numero, e finché i due
//    convivono vanno **letti insieme**: dove si discostano, la differenza è una
//    domanda da fare, non un errore da nascondere.
//
// Sola lettura: il budget non si scrive da qui. In Budgets si propone, si
// approva e si consolida — con un autore e una data.

import { chiave } from "./chiavi";

const BASE = (process.env.BUDGETS_URL || "https://deluxy-budgets.vercel.app").replace(/\/$/, "");

// I siti di Marketing e le maison di Budgets sono la stessa cosa con due nomi:
// l'abbinamento sta scritto qui, in un punto solo, invece che indovinato dal
// nome — «gifts» e «Deluxy.it» non si somigliano nemmeno.
export const MAISON_DI_SITO: Record<string, string> = {
  gifts: "deluxy",
  cake: "cakedesign",
  flowers: "flowers",
};

export type MeseBudget = {
  mese: number;
  vendite: Record<string, number>;
  venditeTotali: number;
  advPercent: number;
  advConsentito: number;
  advPubblicato: number;
  /**
   * Come il monte del mese si ripartisce fra le piattaforme, deciso in
   * Budgets (/piattaforme) e già in euro.
   *
   * ⚠️ `proprio: false` vuol dire che quel brand non ha una ripartizione sua
   * e sta usando quella d'azienda: chi decide deve sapere se guarda una
   * scelta fatta per lui o una ereditata.
   *
   * Facoltativo: le versioni di Budgets precedenti al 23/08/2026 non lo
   * mandano, e mostrare zero al posto di «non lo so» sarebbe peggio.
   */
  piattaforme?: { nome: string; percent: number; proprio: boolean; euro: number }[];
};

export type MaisonBudget = {
  slug: string;
  nome: string;
  mesi: MeseBudget[];
  totali: { vendite: number; advConsentito: number; advPubblicato: number };
};

export type EsitoBudget =
  | { ok: true; maisons: MaisonBudget[]; tipologie: { slug: string; nome: string }[] }
  | { ok: false; errore: string };

export async function budgetDaBudgets(anno: number): Promise<EsitoBudget> {
  const key = await chiave("BUDGETS_API_KEY");
  if (!key) {
    return {
      ok: false,
      errore:
        "BUDGETS_API_KEY non configurata: senza, il budget di vendita e il tetto ADV non si possono leggere da Budgets (Configurazione → Chiavi del Hub, progetto deluxy-marketing).",
    };
  }
  try {
    const res = await fetch(`${BASE}/api/v1/maison?anno=${anno}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
      // Budgets non deve poter bloccare una pagina di Marketing: se tarda, la
      // pagina mostra quello che ha e lo dice.
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { ok: false, errore: "Chiave rifiutata da Budgets (401): controlla BUDGETS_API_KEY." };
    if (res.status === 503) return { ok: false, errore: "L'API di Budgets è spenta: manca BUDGETS_API_KEY su quell'app." };
    if (!res.ok) return { ok: false, errore: `Budgets ha risposto ${res.status}.` };
    const j = (await res.json()) as { maisons?: MaisonBudget[]; tipologie?: { slug: string; nome: string }[] };
    if (!Array.isArray(j?.maisons)) return { ok: false, errore: "Risposta di Budgets non riconosciuta." };
    return { ok: true, maisons: j.maisons, tipologie: j.tipologie ?? [] };
  } catch (e) {
    return { ok: false, errore: `Budgets non raggiungibile: ${(e as Error).message}` };
  }
}

// Il mese di un sito, già abbinato. `null` = quella maison non è nella risposta
// (o il sito non ha una maison): meglio una casella vuota che un numero preso
// dalla maison sbagliata.
export function meseDiSito(esito: EsitoBudget, sito: string, mese: number): MeseBudget | null {
  if (!esito.ok) return null;
  const slug = MAISON_DI_SITO[sito];
  if (!slug) return null;
  const m = esito.maisons.find((x) => x.slug === slug);
  return m?.mesi.find((x) => x.mese === mese) ?? null;
}
