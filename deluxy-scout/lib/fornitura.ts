// LA FORNITURA DI UN ORDINE — chi ci ha fornito cosa, e a che prezzo.
//
// Richiesta dell'utente (27/08/2026): «metti nel form possibilità di scelta di
// uno o più fornitori (integrata ricerca con anagrafiche) e per ogni fornitore
// il prezzo del servizio fornito con possibilità di inserire come nota che cosa
// ha fornito» + «per ogni ordine deve essere indicata obbligatoriamente la
// fornitura».
//
// ⚠️ NON NASCE UNA TABELLA NUOVA, ed è la cosa più importante di questo file.
// Il costo di un ordine ha già una casa: `lavori` (il lavoro da far fare) con i
// suoi `preventivi` (chi lo fa e a quanto), e `costiPerOrdine` li somma già nel
// margine e nella colonna Preventivo. Una tabella parallela «fornitori
// dell'ordine» avrebbe prodotto DUE costi per lo stesso ordine — quello vecchio
// e quello nuovo — e un margine che sottrae due volte o nessuna. Lo Standard
// Deluxy §7 lo dice in una riga: ogni dato ha una casa sola.
//
// La forma è questa, e va rispettata da chi tocca questo file:
//   UNA riga di fornitura  =  UN `lavoro` (legato all'ordine)
//                             + UN `preventivo` in stato `scelto`.
//
// ⚠️ Perché un lavoro per riga e non un lavoro con N preventivi: `costiPerChiave`
// prende UN preventivo per lavoro (lo scelto, o il più basso) — è fatto per
// CONFRONTARE offerte, non per sommarle. Tre fornitori dentro un lavoro solo
// conterebbero come uno. Tre lavori da un fornitore ciascuno si sommano, ed è
// quello che «tre fornitori mi hanno fornito tre cose» vuol dire.
import { supabase } from '@/lib/supabase';
import {
  aggiornaPreventivo,
  aggiungiPreventivo,
  creaLavoro,
  eliminaLavoro,
  type LavoroConPreventivi,
} from '@/lib/preventivi';

/** Una riga di fornitura come la vede la schermata. */
export interface RigaFornitura {
  lavoroId: string;
  preventivoId: string | null;
  fornitore: string;
  /** L'id nel registro Anagrafiche: è lui che dice DI CHI si parla. */
  anagraficheId: string | null;
  /** Quanto ci costa. Null = ancora da sapere (non zero). */
  importo: number | null;
  /** Che cosa ha fornito: è la nota chiesta dall'utente. */
  nota: string | null;
}

/**
 * Le forniture di un ordine, ricavate dai lavori collegati.
 *
 * Si passano i lavori già caricati (la schermata Ordini li ha già in mano per
 * il costo): una seconda lettura per la stessa cosa sarebbe solo più lenta.
 */
export function forniturePerOrdine(lavori: LavoroConPreventivi[], ordineId: string): RigaFornitura[] {
  return lavori
    .filter((l) => l.ordine_id === ordineId)
    .map((l) => {
      // Lo `scelto` è la fornitura vera; se manca si mostra il primo, perché
      // una riga senza preventivo non si potrebbe né leggere né correggere.
      const p = l.preventivi.find((x) => x.stato === 'scelto') ?? l.preventivi[0] ?? null;
      return {
        lavoroId: l.id,
        preventivoId: p?.id ?? null,
        fornitore: p?.fornitore ?? '—',
        anagraficheId: (p as any)?.fornitore_anagrafiche_id ?? null,
        importo: p?.importo ?? null,
        nota: l.descrizione ?? p?.note ?? null,
      };
    });
}

/**
 * Aggiunge una fornitura all'ordine: il lavoro e il suo fornitore scelto.
 *
 * ⚠️ Il preventivo nasce `scelto`, non `ricevuto`: qui non si sta chiedendo un
 * prezzo per confrontarlo, si sta registrando chi ha fornito davvero. Lo stato
 * `scelto` è anche quello che rende il costo DEFINITIVO nella colonna Preventivo
 * — «il più basso» su una fornitura già avvenuta sarebbe una bugia.
 */
export async function aggiungiFornitura(f: {
  ordineId: string;
  placeId?: string | null;
  linea?: string | null;
  fornitore: string;
  anagraficheId?: string | null;
  email?: string | null;
  importo: number | null;
  /** Che cosa ha fornito. Diventa il titolo del lavoro: è quello che si legge. */
  nota: string | null;
}): Promise<void> {
  const cosa = (f.nota ?? '').trim();
  const lavoro = await creaLavoro({
    // Il titolo è quello che si legge negli elenchi: se la nota c'è, è lei.
    titolo: cosa || `Fornitura di ${f.fornitore.trim()}`,
    descrizione: cosa || null,
    ordineId: f.ordineId,
    placeId: f.placeId ?? null,
    linea: f.linea ?? null,
  });
  await aggiungiPreventivo({
    lavoroId: lavoro.id,
    fornitore: f.fornitore,
    fornitoreAnagraficheId: f.anagraficheId ?? null,
    fornitoreEmail: f.email ?? null,
    importo: f.importo,
    note: cosa || null,
  });
  // `aggiungiPreventivo` deduce lo stato dal prezzo (ricevuto/richiesto): qui
  // la fornitura è un fatto, non un'offerta.
  const { data } = await supabase
    .from('preventivi')
    .select('id')
    .eq('lavoro_id', lavoro.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const id = (data ?? [])[0]?.id as string | undefined;
  if (id) await aggiornaPreventivo(id, { stato: 'scelto' });
}

/** Corregge prezzo e descrizione di una fornitura già registrata. */
export async function aggiornaFornitura(
  r: { lavoroId: string; preventivoId: string | null },
  patch: { importo?: number | null; nota?: string | null },
): Promise<void> {
  if (patch.nota !== undefined) {
    const cosa = (patch.nota ?? '').trim() || null;
    const { error } = await supabase
      .from('lavori')
      .update({ descrizione: cosa, ...(cosa ? { titolo: cosa } : {}) })
      .eq('id', r.lavoroId);
    if (error) throw error;
  }
  if (r.preventivoId) {
    const p: { importo?: number | null; note?: string | null } = {};
    if (patch.importo !== undefined) p.importo = patch.importo;
    if (patch.nota !== undefined) p.note = (patch.nota ?? '').trim() || null;
    if (Object.keys(p).length) await aggiornaPreventivo(r.preventivoId, p);
  }
}

/**
 * Toglie una fornitura.
 *
 * ⚠️ Si cancella il LAVORO, non il preventivo: un lavoro senza preventivi
 * resterebbe negli elenchi come una richiesta di prezzo mai fatta, e il conto
 * dei fornitori dell'ordine direbbe uno in più di quelli che ci sono.
 */
export async function rimuoviFornitura(lavoroId: string): Promise<void> {
  await eliminaLavoro(lavoroId);
}
