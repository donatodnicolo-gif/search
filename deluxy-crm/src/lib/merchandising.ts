import { chiaveApp } from "./chiavi-app";
import type { Esito } from "./orders";

// Prodotti e collezioni da Deluxy Merchandising (il PLM: è la casa dei
// prodotti nostri e delle collezioni dei negozi, standard §7). Il CRM li LEGGE
// per proporli nei messaggi ai clienti: nome, prezzo, foto, dove sono in
// vendita. Chiave a sola lettura, emessa da Merchandising → Impostazioni →
// chiavi API (nome «deluxy-crm»); qui in MERCH_API_KEY (+ MERCH_URL).

const BASE_DEFAULT = "https://deluxy-merchandising.vercel.app";
const TIMEOUT_MS = 8000;
const TTL_MS = 5 * 60 * 1000;

export type ProdottoMerch = {
  id: string;
  codice: string;
  nome: string;
  fase: string;
  categoria: string | null;
  descrizione: string | null;
  prezzoVendita: number | null;
  immagine: string | null;
  note: string | null;
  pubblicazioni: { negozio: string; shopifyId: string | null; handle: string | null; statoShopify: string | null }[];
};

export type CollezioneMerch = {
  id: string;
  negozio: string;
  titolo: string;
  handle: string | null;
  stato: string | null;
  prodotti?: number | null;
};

const cache = new Map<string, { dati: unknown; scade: number }>();

async function leggi<T>(percorso: string): Promise<Esito<T>> {
  const inCache = cache.get(percorso);
  if (inCache && inCache.scade > Date.now()) return { ok: true, dati: inCache.dati as T };
  const chiave = await chiaveApp("MERCH_API_KEY");
  if (!chiave) return { ok: false, errore: "Manca MERCH_API_KEY: senza la chiave di Merchandising il catalogo non si vede." };
  const base = ((await chiaveApp("MERCH_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}${percorso}`, {
      headers: { "x-api-key": chiave, "X-App": "deluxy-crm" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, errore: `Merchandising risponde ${res.status}.` };
    const dati = (await res.json()) as T;
    cache.set(percorso, { dati, scade: Date.now() + TTL_MS });
    return { ok: true, dati };
  } catch {
    return { ok: false, errore: "Merchandising non risponde (timeout o rete)." };
  }
}

export async function prodottiMerch(q: string): Promise<Esito<{ totale: number; prodotti: ProdottoMerch[] }>> {
  const qs = new URLSearchParams({ q, limit: "30", fase: "in_vendita" });
  return leggi(`/api/v1/prodotti?${qs}`);
}

export async function collezioniMerch(q: string): Promise<Esito<{ totale: number; collezioni: CollezioneMerch[] }>> {
  const qs = new URLSearchParams({ q, limit: "30", stato: "attiva" });
  return leggi(`/api/v1/collezioni?${qs}`);
}

// Merchandising raggiungibile e con la chiave giusta? Per Impostazioni.
export async function statoMerch(): Promise<{ raggiungibile: boolean; autenticato: boolean }> {
  const base = ((await chiaveApp("MERCH_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
  try {
    const salute = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!salute.ok) return { raggiungibile: false, autenticato: false };
  } catch {
    return { raggiungibile: false, autenticato: false };
  }
  const prova = await leggi<unknown>(`/api/v1/collezioni?limit=1`);
  return { raggiungibile: true, autenticato: prova.ok };
}
