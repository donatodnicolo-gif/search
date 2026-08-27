// PREVENTIVI FORNITORI — i prezzi che chiediamo per un lavoro specifico.
//
// Il cliente chiede qualcosa fuori standard; noi chiediamo il prezzo a due o tre
// fornitori e scegliamo. Finora quei numeri stavano su WhatsApp e nella memoria
// di chi li aveva chiesti: dopo una settimana nessuno sapeva più chi avesse
// offerto cosa, e la richiesta si rifaceva da capo.
//
// **Il lavoro è uno, i preventivi sono tanti**: è la separazione che permette di
// confrontarli, che è la ragione per cui si chiedono.
import { supabase } from '@/lib/supabase';

export type StatoLavoro = 'aperto' | 'chiuso' | 'annullato';
export type StatoPreventivo = 'richiesto' | 'ricevuto' | 'scelto' | 'scartato';

export const LABEL_STATO_LAVORO: Record<StatoLavoro, string> = {
  aperto: 'Aperto',
  chiuso: 'Chiuso',
  annullato: 'Annullato',
};

export const LABEL_STATO_PREVENTIVO: Record<StatoPreventivo, string> = {
  richiesto: 'In attesa',
  ricevuto: 'Ricevuto',
  scelto: 'Scelto',
  scartato: 'Scartato',
};

export interface Lavoro {
  id: string;
  titolo: string;
  descrizione: string | null;
  place_id: string | null;
  /** La vendita a cui appartiene: una delle tre (migr. 0077). */
  deal_id: string | null;
  richiesta_id?: string | null;
  ordine_id?: string | null;
  linea: string | null;
  serve_entro: string | null;
  stato: StatoLavoro;
  note: string | null;
  created_at: string;
  /** Nome del negozio che l'ha chiesto (dalla join). */
  place_nome?: string | null;
}

export interface Preventivo {
  id: string;
  lavoro_id: string;
  fornitore: string;
  fornitore_place_id: string | null;
  /** NULL = chiesto ma non ancora risposto. Non è zero: è «non lo sappiamo».
   *  ⚠️ È sempre il TOTALE, anche quando il fornitore ha quotato a pezzo: il
   *  margine, il confronto e i totali leggono questo campo. */
  importo: number | null;
  /** Gli INGREDIENTI del totale, quando il prezzo è a quantità (migr. 0088). */
  prezzo_unitario?: number | null;
  quantita?: number | null;
  unita?: 'pezzi' | 'giorni' | 'ore' | null;
  tempi: string | null;
  valido_fino: string | null;
  note: string | null;
  allegato_url: string | null;
  stato: StatoPreventivo;
  created_at: string;
  /** Da dove arriva la riga (migr. 0066): NULL = scritta a mano qui dentro,
   *  'mail' = registrata da AI Mail quando il fornitore ha risposto. Un importo
   *  senza provenienza è un numero di cui non ci si fida. */
  origine?: string | null;
  /** L'indirizzo da cui è arrivato il prezzo: `fornitore` è solo un nome. */
  fornitore_email?: string | null;
  /** Id INTERNO del messaggio in AI Mail: apre la mail con quel prezzo dentro.
   *  Non è il Message-ID della posta — quello in un URL non apre niente. */
  mail_ref?: string | null;
}

/** Un lavoro con i suoi preventivi: è come si guarda, sempre. */
export interface LavoroConPreventivi extends Lavoro {
  preventivi: Preventivo[];
}

export async function fetchLavori(): Promise<LavoroConPreventivi[]> {
  const { data, error } = await supabase
    .from('lavori')
    .select('*, places(nome), preventivi(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    place_nome: r.places?.nome ?? null,
    // I preventivi arrivano nell'ordine che vuole il database: qui si mettono
    // dal più vecchio al più nuovo, che è l'ordine in cui sono stati chiesti.
    preventivi: ((r.preventivi ?? []) as Preventivo[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  })) as LavoroConPreventivi[];
}

/**
 * ⚠️ LA TRATTATIVA È OBBLIGATORIA (26/08/2026, richiesta dell'utente: «tutti i
 * preventivi devono essere collegati a delle trattative»).
 *
 * Il motivo non è formale: un preventivo fornitore è quanto ci COSTA un lavoro,
 * e serve a decidere il prezzo di una vendita. Senza la trattativa a cui
 * appartiene resta un numero senza destinazione — non si sa per chi lo si è
 * chiesto né se quel lavoro l'abbiamo poi venduto, e il margine non si può
 * fare. `deal_id` esisteva già sulla tabella, ma nessuno lo riempiva.
 */
export async function creaLavoro(l: {
  titolo: string;
  /** La vendita a cui appartiene: UNA delle tre (migr. 0077). */
  dealId?: string | null;
  richiestaId?: string | null;
  ordineId?: string | null;
  descrizione?: string | null;
  placeId?: string | null;
  linea?: string | null;
  serveEntro?: string | null;
}): Promise<Lavoro> {
  if (!l.dealId && !l.richiestaId && !l.ordineId) {
    throw new Error('Serve la vendita a cui appartiene: una trattativa, una richiesta cliente o un ordine.');
  }
  const { data, error } = await supabase
    .from('lavori')
    .insert({
      titolo: l.titolo.trim(),
      descrizione: l.descrizione?.trim() || null,
      place_id: l.placeId || null,
      deal_id: l.dealId || null,
      richiesta_id: l.richiestaId || null,
      ordine_id: l.ordineId || null,
      linea: l.linea || null,
      serve_entro: l.serveEntro || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Lavoro;
}

/**
 * ⭐ QUANTO CI COSTA UNA TRATTATIVA, per metterlo accanto a quanto la vendiamo
 * (26/08/2026, richiesta dell'utente sugli Ordini: «aggiungi fornitore e
 * miglior preventivo… calcola il margine»).
 *
 * Per ogni trattativa (`deal_id`) si guardano i lavori collegati e, dentro
 * ognuno, i suoi preventivi:
 *   · se un preventivo è stato **SCELTO**, è quello — è una decisione presa,
 *     e vince su qualunque numero più basso arrivato dopo;
 *   · altrimenti si prende il **più basso fra quelli ricevuti**, ed è una
 *     stima: il fornitore non è ancora stato scelto.
 * I lavori di una stessa trattativa si SOMMANO: due lavori sono due costi.
 *
 * ⚠️ Chi non ha nessun preventivo ricevuto NON vale zero: torna `null`, e a
 * schermo diventa «—». Un costo assente contato come zero farebbe un margine
 * pari al prezzo pieno — il numero più ottimista e più falso che ci sia.
 */
export interface CostoTrattativa {
  /** Somma dei preventivi (scelti se ci sono, altrimenti i più bassi). */
  costo: number;
  /** true = sono tutte scelte definitive; false = è una stima. */
  definitivo: boolean;
  /** Chi lo fa: il nome, o «N fornitori» quando i lavori sono più d'uno. */
  fornitore: string;
  /** Quanti lavori hanno concorso al costo. */
  lavori: number;
}

/**
 * Il costo di ciascun ORDINE. Un lavoro può essere agganciato alla trattativa,
 * alla richiesta cliente o direttamente all'ordine (migr. 0077): si guardano
 * tutte e tre le strade, perché l'ordine è lo stesso da qualunque parte sia
 * nato e il margine dev'essere quello.
 */
export function costiPerOrdine(
  lavori: LavoroConPreventivi[],
  ordini: { id: string; deal_id?: string | null; richiesta_id?: string | null }[],
): Map<string, CostoTrattativa> {
  const perChiave = costiPerChiave(lavori);
  const out = new Map<string, CostoTrattativa>();
  for (const o of ordini) {
    const c =
      perChiave.get(`ordine:${o.id}`) ??
      (o.deal_id ? perChiave.get(`deal:${o.deal_id}`) : undefined) ??
      (o.richiesta_id ? perChiave.get(`richiesta:${o.richiesta_id}`) : undefined);
    if (c) out.set(o.id, c);
  }
  return out;
}

/** Come sopra, ma indicizzato per `deal:<id>` / `richiesta:<id>` / `ordine:<id>`. */
export function costiPerChiave(lavori: LavoroConPreventivi[]): Map<string, CostoTrattativa> {
  const perDeal = new Map<string, CostoTrattativa>();
  /** I fornitori DISTINTI di ogni vendita: l'etichetta li conta, non i lavori. */
  const nomi = new Map<string, Set<string>>();
  for (const l of lavori) {
    const chiave = l.ordine_id
      ? `ordine:${l.ordine_id}`
      : l.richiesta_id
        ? `richiesta:${l.richiesta_id}`
        : l.deal_id
          ? `deal:${l.deal_id}`
          : null;
    if (!chiave) continue;
    const scelto = l.preventivi.find((p) => p.stato === 'scelto' && p.importo != null);
    const candidati = l.preventivi.filter((p) => p.importo != null && p.stato !== 'scartato');
    const migliore =
      scelto ??
      candidati.reduce<Preventivo | null>((min, p) => (!min || (p.importo ?? 0) < (min.importo ?? 0) ? p : min), null);
    if (!migliore || migliore.importo == null) continue;
    const gia = perDeal.get(chiave);
    if (!gia) {
      nomi.set(chiave, new Set(migliore.fornitore ? [migliore.fornitore] : []));
      perDeal.set(chiave, {
        costo: migliore.importo,
        definitivo: Boolean(scelto),
        fornitore: migliore.fornitore,
        lavori: 1,
      });
      continue;
    }
    gia.costo += migliore.importo;
    // Basta un lavoro ancora da decidere perché il totale sia una stima.
    gia.definitivo = gia.definitivo && Boolean(scelto);
    gia.lavori += 1;
    // ⚠️ «N fornitori» conta i FORNITORI, non i lavori (corretto il 27/08/2026).
    // Prima l'etichetta si componeva con `gia.lavori`, e per giunta dopo la
    // prima divergenza il confronto restava vero per sempre: tre lavori con due
    // fornitori — o anche con lo stesso fornitore ripetuto — dicevano «3
    // fornitori». Nella colonna Fornitore degli Ordini si leggeva un numero
    // falso.
    if (migliore.fornitore) nomi.get(chiave)!.add(migliore.fornitore);
    const distinti = nomi.get(chiave)!;
    gia.fornitore = distinti.size <= 1 ? [...distinti][0] ?? null : `${distinti.size} fornitori`;
  }
  return perDeal;
}

/** Collega a una trattativa un lavoro che era nato senza (o cambia la sua). */
export async function collegaLavoroATrattativa(id: string, dealId: string): Promise<void> {
  const { error } = await supabase.from('lavori').update({ deal_id: dealId }).eq('id', id);
  if (error) throw error;
}

export async function aggiornaLavoro(id: string, patch: Partial<Pick<Lavoro, 'stato' | 'note' | 'serve_entro'>>): Promise<void> {
  const { error } = await supabase.from('lavori').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminaLavoro(id: string): Promise<void> {
  const { error } = await supabase.from('lavori').delete().eq('id', id);
  if (error) throw error;
}

export async function aggiungiPreventivo(p: {
  lavoroId: string;
  fornitore: string;
  fornitorePlaceId?: string | null;
  /** L'id nel registro Anagrafiche: è lui che dice DI CHI si parla. */
  fornitoreAnagraficheId?: string | null;
  /** L'indirizzo a cui è stato chiesto il prezzo, se lo sappiamo. */
  fornitoreEmail?: string | null;
  importo?: number | null;
  /** Se il fornitore ha quotato a unità: il prezzo di una, quante, e di che
   *  cosa. ⚠️ Il totale resta `importo` — questi lo spiegano, non lo
   *  sostituiscono. */
  prezzoUnitario?: number | null;
  quantita?: number | null;
  unita?: 'pezzi' | 'giorni' | 'ore' | null;
  tempi?: string | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('preventivi').insert({
    lavoro_id: p.lavoroId,
    fornitore: p.fornitore.trim(),
    fornitore_place_id: p.fornitorePlaceId || null,
    fornitore_anagrafiche_id: p.fornitoreAnagraficheId || null,
    fornitore_email: p.fornitoreEmail?.trim() || null,
    importo: p.importo ?? null,
    prezzo_unitario: p.prezzoUnitario ?? null,
    quantita: p.quantita ?? null,
    unita: p.unita ?? null,
    tempi: p.tempi?.trim() || null,
    note: p.note?.trim() || null,
    // Con un prezzo dentro il preventivo è già arrivato; senza, lo stiamo
    // ancora aspettando. Lo stato si deduce, non si chiede.
    stato: p.importo != null ? 'ricevuto' : 'richiesto',
  });
  if (error) throw error;
}

export async function aggiornaPreventivo(
  id: string,
  patch: Partial<Pick<Preventivo, 'importo' | 'tempi' | 'note' | 'valido_fino' | 'allegato_url' | 'stato'>>,
): Promise<void> {
  const { error } = await supabase.from('preventivi').update(patch).eq('id', id);
  if (error) throw error;
}

export async function eliminaPreventivo(id: string): Promise<void> {
  const { error } = await supabase.from('preventivi').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sceglie un fornitore per il lavoro.
 *
 * ⚠️ Prima si toglie lo «scelto» agli altri, poi si mette a questo: l'indice
 * unico parziale (`preventivi_scelto_uix`) permette **un solo** scelto per
 * lavoro, quindi facendolo al contrario la scrittura verrebbe rifiutata e
 * l'utente vedrebbe un errore di database al posto di un cambio di scelta.
 */
export async function scegliPreventivo(lavoroId: string, preventivoId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from('preventivi')
    .update({ stato: 'scartato' })
    .eq('lavoro_id', lavoroId)
    .eq('stato', 'scelto')
    .neq('id', preventivoId);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('preventivi').update({ stato: 'scelto' }).eq('id', preventivoId);
  if (e2) throw e2;
}

/**
 * Il confronto, in numeri: il più basso fra quelli **arrivati** e quanto ci
 * distano gli altri. I preventivi senza importo non entrano nel conto — non
 * sono «gratis», semplicemente non sono ancora arrivati.
 */
export function confronto(preventivi: Preventivo[]): {
  minimo: number | null;
  massimo: number | null;
  inAttesa: number;
} {
  const importi = preventivi
    .filter((p) => p.stato !== 'scartato' && p.importo != null)
    .map((p) => Number(p.importo));
  return {
    minimo: importi.length ? Math.min(...importi) : null,
    massimo: importi.length ? Math.max(...importi) : null,
    inAttesa: preventivi.filter((p) => p.importo == null && p.stato === 'richiesto').length,
  };
}
