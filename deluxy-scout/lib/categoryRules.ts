// Applicazione delle regole di categoria (regola di prodotto #1):
// da `categoria` → linea_ipotizzata + aggancio_apertura + priorità.
//
// Le regole "vere" vivono nella tabella Supabase `category_rules` (modificabili
// senza rilasciare l'app). Qui teniamo un fallback locale identico al seed, così
// l'app funziona anche prima del primo caricamento e offline.
import type { CategoryRule, Place, Priorita } from '@/types';
import { supabase } from '@/lib/supabase';

// Fallback locale — allineato a supabase/migrations (seed category_rules).
export const REGOLE_FALLBACK: Omit<CategoryRule, 'id'>[] = [
  { categoria: 'moda', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Consegne guanti bianchi + regalistica VIP multi-città', priorita: 'P1' },
  { categoria: 'maison', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Consegne guanti bianchi + regalistica VIP multi-città', priorita: 'P1' },
  { categoria: 'gioielleria', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Consegne assicurate di pregio per top client', priorita: 'P1' },
  { categoria: 'orologeria', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Consegne assicurate di pregio per top client', priorita: 'P1' },
  { categoria: 'hotel', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Consegne in struttura + amenities + catering eventi', priorita: 'P1' },
  { categoria: 'ristorante premium', linea_ipotizzata: 'Food Supplier', aggancio_apertura: 'Fornitura torte e pasticceria B2B', priorita: 'P1' },
  { categoria: 'fioraio', linea_ipotizzata: 'Re-seller', aggancio_apertura: 'Affiliazione su deluxy.it', priorita: 'P1' },
  { categoria: 'pasticceria', linea_ipotizzata: 'Re-seller', aggancio_apertura: 'Affiliazione su deluxy.it', priorita: 'P1' },
  { categoria: 'studio legale', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Gifting stagionale e chiusura deal', priorita: 'P2' },
  { categoria: 'consulenza', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Gifting stagionale e chiusura deal', priorita: 'P2' },
  { categoria: 'banca', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Gifting stagionale e chiusura deal', priorita: 'P2' },
  { categoria: 'profumeria', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Regali aziendali + consegne PR/redazionali', priorita: 'P2' },
  { categoria: 'cosmetica', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Regali aziendali + consegne PR/redazionali', priorita: 'P2' },
  { categoria: 'immobiliare di pregio', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Gift closing e welcome home', priorita: 'P2' },
  { categoria: 'wedding', linea_ipotizzata: 'Catering', aggancio_apertura: 'Catering + Consegne per allestimenti', priorita: 'P2' },
  { categoria: 'event planner', linea_ipotizzata: 'Catering', aggancio_apertura: 'Catering + Consegne per allestimenti', priorita: 'P2' },
  { categoria: 'azienda corporate', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Macarons B2B, kit ricorrenze', priorita: 'P2' },
  { categoria: 'uffici', linea_ipotizzata: 'Regali aziendali', aggancio_apertura: 'Macarons B2B, kit ricorrenze', priorita: 'P2' },
  { categoria: 'retail generico', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Da qualificare in visita; consegne come aggancio', priorita: 'P3' },
  { categoria: 'altro', linea_ipotizzata: 'Consegne', aggancio_apertura: 'Da qualificare in visita; consegne come aggancio', priorita: 'P3' },
];

function normalizza(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Trova la regola per una categoria. Match esatto, poi "contiene" per essere
 * tolleranti su varianti (es. "ristorante premium stellato").
 */
export function regolaPerCategoria(
  categoria: string | null | undefined,
  regole: Omit<CategoryRule, 'id'>[],
): Omit<CategoryRule, 'id'> | null {
  if (!categoria) return regolaPerCategoria('altro', regole);
  const c = normalizza(categoria);
  const esatta = regole.find((r) => normalizza(r.categoria) === c);
  if (esatta) return esatta;
  const parziale = regole.find(
    (r) => c.includes(normalizza(r.categoria)) || normalizza(r.categoria).includes(c),
  );
  return parziale ?? regole.find((r) => normalizza(r.categoria) === 'altro') ?? null;
}

/** Carica le regole da Supabase; se fallisce, usa il fallback locale. */
export async function caricaRegole(): Promise<Omit<CategoryRule, 'id'>[]> {
  try {
    const { data, error } = await supabase
      .from('category_rules')
      .select('categoria, linea_ipotizzata, aggancio_apertura, priorita');
    if (error || !data || data.length === 0) return REGOLE_FALLBACK;
    return data as Omit<CategoryRule, 'id'>[];
  } catch {
    return REGOLE_FALLBACK;
  }
}

/**
 * Per ogni place senza `linea_ipotizzata`, applica la regola della sua categoria
 * e salva il record su Supabase. Restituisce i place aggiornati (in memoria).
 */
export async function popolaIpotesiMancanti(
  places: Place[],
  regole: Omit<CategoryRule, 'id'>[],
): Promise<Place[]> {
  const daAggiornare = places.filter((p) => !p.linea_ipotizzata);
  if (daAggiornare.length === 0) return places;

  const patchById = new Map<string, Partial<Place>>();
  for (const p of daAggiornare) {
    const regola = regolaPerCategoria(p.categoria, regole);
    if (!regola) continue;
    patchById.set(p.id, {
      linea_ipotizzata: regola.linea_ipotizzata,
      aggancio_apertura: regola.aggancio_apertura,
      priorita: regola.priorita as Priorita,
    });
  }

  // Update mirati (una call per record: pochi record e solo al primo load).
  await Promise.all(
    Array.from(patchById.entries()).map(([id, patch]) =>
      supabase.from('places').update(patch).eq('id', id),
    ),
  );

  return places.map((p) => (patchById.has(p.id) ? { ...p, ...patchById.get(p.id)! } : p));
}
