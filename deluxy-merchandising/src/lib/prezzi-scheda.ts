// **Le righe di «Varianti e prezzi» della scheda prodotto** (07/09/2026,
// chiesto dall'utente: «fare migliore UX&UI, più comprensibile: vista con
// varianti e prezzo e vista del prezzo pubblico e prezzo partner»).
//
// Prima il prezzo delle varianti stava solo in «Costi & margini» come delta
// rispetto al base, e il prezzo partner non compariva da nessuna parte della
// scheda: si vedeva solo aprendo il modulo di modifica. Qui si calcola UNA
// volta, in valori assoluti, quello che le due viste mostrano — così i numeri
// della tabella e quelli del riepilogo in testa non possono divergere.
//
// Funzioni pure: niente Prisma, niente Date. Si provano a mano con tsx.

import { prezzoVariante } from "./dominio";

export type ProdottoPerPrezzi = {
  codice: string;
  prezzoVendita: number;
  costoProduzione: number;
  prezzoPartner: number | null;
  note: string | null;
  tipoShopify?: string | null;
  nome?: string | null;
};

export type VariantePerPrezzi = {
  id: string;
  nome: string;
  sku: string | null;
  deltaPrezzo: number;
  deltaCosto: number;
  prezzoPartner: number | null;
  note: string | null;
  giacenza: number;
};

export type RigaPrezzo = {
  id: string;
  nome: string;
  sku: string | null;
  /** Prezzo pubblico, quello che il cliente paga sul sito. */
  pubblico: number;
  costo: number;
  /** Quanto va al partner: della variante, o del prodotto se la variante non ne ha uno. */
  partner: number | null;
  /** Il prezzo partner mostrato è quello del prodotto, non della variante. */
  partnerDelProdotto: boolean;
  /** Cosa comprende: la nota della variante, o quella del prodotto. */
  comprende: string | null;
  comprendeDelProdotto: boolean;
  giacenza: number | null;
  /** È la riga fittizia di un prodotto senza varianti. */
  senzaVarianti: boolean;
};

/** Pubblico − partner, e la quota del pubblico che resta (0..1). `null` senza partner. */
export function differenza(r: { pubblico: number; partner: number | null }): { euro: number; quota: number | null } | null {
  if (r.partner == null) return null;
  const euro = r.pubblico - r.partner;
  return { euro, quota: r.pubblico > 0 ? euro / r.pubblico : null };
}

export function righePrezzi(p: ProdottoPerPrezzi, varianti: VariantePerPrezzi[]): RigaPrezzo[] {
  if (varianti.length === 0) {
    return [
      {
        id: "prodotto",
        nome: "Prodotto (senza varianti)",
        sku: p.codice,
        pubblico: p.prezzoVendita || 0,
        costo: p.costoProduzione || 0,
        partner: p.prezzoPartner,
        partnerDelProdotto: false,
        comprende: p.note,
        comprendeDelProdotto: false,
        giacenza: null,
        senzaVarianti: true,
      },
    ];
  }
  return varianti.map((v) => {
    const pv = prezzoVariante(p, v);
    const partnerProprio = v.prezzoPartner != null;
    const notaPropria = !!v.note?.trim();
    return {
      id: v.id,
      nome: v.nome,
      sku: v.sku,
      pubblico: pv.prezzo,
      costo: pv.costo,
      partner: partnerProprio ? v.prezzoPartner : p.prezzoPartner,
      partnerDelProdotto: !partnerProprio && p.prezzoPartner != null,
      comprende: notaPropria ? (v.note as string) : p.note,
      comprendeDelProdotto: !notaPropria && !!p.note?.trim(),
      giacenza: v.giacenza,
      senzaVarianti: false,
    };
  });
}

export type SintesiPrezzi = {
  varianti: number;
  pubblico: { min: number; max: number } | null;
  partner: { min: number; max: number } | null;
  /** Quante righe non hanno un prezzo partner (né proprio né del prodotto). */
  senzaPartner: number;
  differenza: { min: number; max: number } | null;
};

function intervallo(valori: number[]): { min: number; max: number } | null {
  const v = valori.filter((x) => Number.isFinite(x));
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

export function sintesiPrezzi(righe: RigaPrezzo[]): SintesiPrezzi {
  const conPartner = righe.filter((r) => r.partner != null);
  return {
    varianti: righe.filter((r) => !r.senzaVarianti).length,
    pubblico: intervallo(righe.map((r) => r.pubblico).filter((x) => x > 0)),
    partner: intervallo(conPartner.map((r) => r.partner as number)),
    senzaPartner: righe.length - conPartner.length,
    differenza: intervallo(conPartner.map((r) => (differenza(r) as { euro: number }).euro)),
  };
}

/** «85 €» oppure «85–120 €» quando le varianti hanno prezzi diversi. */
export function euroIntervallo(i: { min: number; max: number } | null, euro: (n: number) => string): string | null {
  if (!i) return null;
  return i.min === i.max ? euro(i.min) : `${euro(i.min).replace(/\s?€$/, "")}–${euro(i.max)}`;
}

/**
 * Le colazioni e i brunch: i prodotti per cui la nota «cosa comprende» (il
 * menù) DEVE esserci — come per i fiori c'è il numero di fiori nel nome della
 * variante. Si riconoscono dal Tipo del negozio («Colazioni», «Colazioni &
 * Brunch», «Brunch», «Colazione») e, in mancanza, dal nome. Su queste schede
 * una nota vuota si mostra come coda di lavoro («da indicare»), non come «—».
 */
export function eColazione(p: { tipoShopify?: string | null; nome?: string | null }): boolean {
  const tipo = (p.tipoShopify ?? "").toLowerCase();
  if (/colazion|brunch/.test(tipo)) return true;
  return /\bcolazion|\bbrunch\b/i.test(p.nome ?? "");
}
