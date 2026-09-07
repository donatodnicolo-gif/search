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
import { colors } from '@/lib/theme';

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

/**
 * Il colore di ogni stato, accanto alla sua etichetta (07/09/2026): stava
 * scritto dentro `app/(app)/preventivi.tsx`, e da oggi lo stesso badge si
 * disegna anche dalla trattativa. Due copie dello stesso colore divergono.
 */
export const COLORE_STATO_PREVENTIVO: Record<StatoPreventivo, string> = {
  richiesto: colors.grigio,
  ricevuto: colors.blue,
  scelto: colors.successo,
  scartato: colors.errore,
};

export interface Lavoro {
  id: string;
  titolo: string;
  descrizione: string | null;
  place_id: string | null;
  /** La vendita a cui appartiene: una delle tre (migr. 0077). */
  deal_id: string | null;
  /** La trattativa di HUBSPOT, quando la vendita non ha una riga in deals
   *  (migr. 0101): l'elenco trattative usa per quelle l'id sintetico
   *  `hs_<id>`, che in un uuid non entra — e non deve. */
  hubspot_deal_id?: string | null;
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
  /**
   * ⚠️ GLI ID SINTETICI SI SMISTANO (28/08/2026, segnalazione dell'utente:
   * «invalid input syntax for type uuid: "hs_512059002060"»).
   *
   * L'elenco trattative è fatto di tre fonti: i deals di Scout (uuid vero),
   * quelli di HubSpot (`hs_<id>`) e i partner del registro in trattativa
   * (`ana_<place>`). Solo il primo può entrare in `deal_id`: il secondo va
   * nella SUA colonna, il terzo è in realtà il negozio — e infilare un id
   * sintetico nell'uuid non era un collegamento, era l'errore del database
   * mostrato all'utente.
   */
  let dealUuid = l.dealId || null;
  let hubspotDealId: string | null = null;
  let placeDaRegistro: string | null = null;
  if (dealUuid?.startsWith('hs_')) {
    hubspotDealId = dealUuid.slice(3);
    dealUuid = null;
  } else if (dealUuid?.startsWith('ana_')) {
    placeDaRegistro = dealUuid.slice(4);
    dealUuid = null;
  }
  const { data, error } = await supabase
    .from('lavori')
    .insert({
      titolo: l.titolo.trim(),
      descrizione: l.descrizione?.trim() || null,
      place_id: l.placeId || placeDaRegistro || null,
      deal_id: dealUuid,
      hubspot_deal_id: hubspotDealId,
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
/**
 * ⭐ LA CHIAVE DELLA VENDITA a cui un lavoro appartiene — `ordine:<id>`,
 * `richiesta:<id>` o `deal:<id>` — in UN posto solo (07/09/2026).
 *
 * ⚠️ L'ordine dei rami è una regola, non un caso: **il legame più vicino
 * vince**. Un lavoro agganciato direttamente all'ordine racconta il costo di
 * QUELL'ordine, anche se la trattativa da cui è nato ne ha altri.
 *
 * ⚠️ `deal:hs_<id>` è lo stesso id sintetico dell'elenco trattative: quelle
 * righe si chiamano così, e la chiave deve parlare la loro lingua. Era scritta
 * dentro `costiPerChiave`; ora che la leggono in due, riscriverla sarebbe una
 * regola ricopiata — e queste divergono sempre.
 */
export function chiaveVendita(l: {
  ordine_id?: string | null;
  richiesta_id?: string | null;
  deal_id?: string | null;
  hubspot_deal_id?: string | null;
}): string | null {
  if (l.ordine_id) return `ordine:${l.ordine_id}`;
  if (l.richiesta_id) return `richiesta:${l.richiesta_id}`;
  if (l.deal_id) return `deal:${l.deal_id}`;
  if (l.hubspot_deal_id) return `deal:hs_${l.hubspot_deal_id}`;
  return null;
}

/**
 * ⭐ I PREVENTIVI DI UNA VENDITA, contati e ordinati (07/09/2026, richiesta
 * dell'utente: «fai vedere anche in trattative e per trattativa quali sono i
 * preventivi che abbiamo ricevuto»).
 *
 * `costiPerChiave` dice quanto COSTA — un numero solo, e chi non ha nessun
 * preventivo ricevuto non entra nemmeno nella mappa. Qui serve l'altra metà:
 * QUALI sono, quanti se ne aspettano ancora, e chi li ha mandati. Un fornitore
 * a cui abbiamo chiesto e che non ha ancora risposto è un'informazione che
 * vale quanto un prezzo — è la ragione per cui si sollecita.
 *
 * ⚠️ Gli SCARTATI restano nell'elenco ma non contano né come ricevuti né nel
 * confronto: sono la memoria di una scelta fatta, non un'offerta in gioco.
 */
export interface RiepilogoPreventivi {
  /** Tutti, in ordine di arrivo, scartati compresi. */
  tutti: Preventivo[];
  /** Con un importo e non scartati: le offerte vere in gioco. */
  ricevuti: Preventivo[];
  /** Chiesti e ancora senza prezzo: quelli da sollecitare. */
  inAttesa: Preventivo[];
  /** Il preventivo SCELTO, se qualcuno ha deciso. */
  scelto: Preventivo | null;
  /** Lo scelto se c'è, altrimenti il più basso ricevuto (che è una stima). */
  migliore: Preventivo | null;
  /** Quanti lavori compongono questa vendita. */
  lavori: number;
}

/** I preventivi indicizzati come `costiPerChiave`: `deal:<id>` & co. */
export function preventiviPerChiave(
  lavori: LavoroConPreventivi[],
): Map<string, RiepilogoPreventivi> {
  const gruppi = new Map<string, LavoroConPreventivi[]>();
  for (const l of lavori) {
    const chiave = chiaveVendita(l);
    if (!chiave) continue;
    const g = gruppi.get(chiave);
    if (g) g.push(l);
    else gruppi.set(chiave, [l]);
  }
  const out = new Map<string, RiepilogoPreventivi>();
  for (const [chiave, suoi] of gruppi) out.set(chiave, riepilogoDeiLavori(suoi));
  return out;
}

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

/**
 * ⭐ IL PREVENTIVO CHE DECIDE IL COSTO DI UN LAVORO, in un posto solo
 * (estratto il 07/09/2026): lo SCELTO se qualcuno ha deciso — è una decisione
 * presa, e vince su qualunque numero più basso arrivato dopo — altrimenti il
 * più basso fra quelli ricevuti, che è una stima.
 *
 * ⚠️ Gli SCARTATI non concorrono: sono la memoria di una scelta, non
 * un'offerta in gioco. E un preventivo senza importo non è zero: è «non ha
 * ancora risposto», e un lavoro così non fa costo per niente.
 */
export function preventivoDecisivo(l: LavoroConPreventivi): {
  preventivo: Preventivo | null;
  scelto: boolean;
} {
  const scelto = l.preventivi.find((p) => p.stato === 'scelto' && p.importo != null);
  if (scelto) return { preventivo: scelto, scelto: true };
  const candidati = l.preventivi.filter((p) => p.importo != null && p.stato !== 'scartato');
  const min = candidati.reduce<Preventivo | null>(
    (m, p) => (!m || (p.importo ?? 0) < (m.importo ?? 0) ? p : m),
    null,
  );
  return { preventivo: min, scelto: false };
}

/**
 * ⭐ LA TRATTATIVA A CUI UN LAVORO APPARTIENE — anche passando per l'ORDINE
 * che ne è nato (07/09/2026).
 *
 * Misurato sul database il giorno in cui la trattativa ha iniziato a mostrare
 * i suoi preventivi: **14 lavori su 15 erano agganciati a un ordine**, uno solo
 * direttamente alla trattativa. Guardando il solo legame diretto la schermata
 * sarebbe nata vuota su quasi tutto — e avrebbe detto «nessun preventivo»
 * proprio dove i preventivi c'erano.
 *
 * È il giro dell'ordine letto al contrario: `costiPerOrdine` scende dalla
 * trattativa all'ordine per fare il margine, qui si risale.
 *
 * ⚠️ Il legame DIRETTO vince: un lavoro agganciato alla trattativa è di quella
 * trattativa anche se l'ordine che ne è nato ne ha altri.
 * ⚠️ Le RICHIESTE CLIENTE non risalgono (oggi non ne hanno nessuno): una
 * richiesta non è una trattativa, e dedurre il legame sarebbe un'invenzione.
 */
export function trattativaDelLavoro(
  l: {
    deal_id?: string | null;
    hubspot_deal_id?: string | null;
    ordine_id?: string | null;
    /** Accettata e IGNORATA di proposito: vedi la nota qui sopra. Sta nella
     *  firma perche i chiamanti passano il lavoro intero, e perche il test che
     *  tiene ferma la regola deve poterla scrivere. */
    richiesta_id?: string | null;
  },
  dealDellOrdine: Map<string, string>,
): string | null {
  if (l.deal_id) return l.deal_id;
  if (l.hubspot_deal_id) return `hs_${l.hubspot_deal_id}`;
  if (l.ordine_id) return dealDellOrdine.get(l.ordine_id) ?? null;
  return null;
}

/** Il riepilogo di un gruppo di lavori, comunque li si sia raggruppati. */
export function riepilogoDeiLavori(lavori: LavoroConPreventivi[]): RiepilogoPreventivi {
  const r: RiepilogoPreventivi = {
    tutti: [],
    ricevuti: [],
    inAttesa: [],
    scelto: null,
    migliore: null,
    lavori: lavori.length,
  };
  for (const l of lavori) {
    for (const p of l.preventivi) {
      r.tutti.push(p);
      if (p.stato === 'scartato') continue;
      if (p.importo != null) r.ricevuti.push(p);
      else if (p.stato === 'richiesto') r.inAttesa.push(p);
      if (p.stato === 'scelto' && p.importo != null && !r.scelto) r.scelto = p;
    }
  }
  // Il migliore si calcola alla fine: con più lavori i candidati arrivano da
  // giri diversi del ciclo. Lo SCELTO vince su qualunque numero più basso
  // arrivato dopo, perché è una decisione presa e non un confronto.
  r.migliore =
    r.scelto ??
    r.ricevuti.reduce<Preventivo | null>(
      (min, p) => (!min || (p.importo ?? 0) < (min.importo ?? 0) ? p : min),
      null,
    );
  return r;
}

/** Il costo di un gruppo di lavori: la somma dei loro preventivi decisivi. */
export interface CostoDeiLavori {
  costo: number;
  /** true = tutti scelti; false = c'è dentro almeno una stima. */
  definitivo: boolean;
  /** Quanti lavori hanno davvero un prezzo. */
  lavori: number;
}
export function costoDeiLavori(lavori: LavoroConPreventivi[]): CostoDeiLavori | null {
  let costo = 0;
  let definitivo = true;
  let quanti = 0;
  for (const l of lavori) {
    const { preventivo, scelto } = preventivoDecisivo(l);
    if (!preventivo || preventivo.importo == null) continue;
    costo += preventivo.importo;
    // Basta un lavoro ancora da decidere perché il totale sia una stima.
    definitivo = definitivo && scelto;
    quanti += 1;
  }
  return quanti ? { costo, definitivo, lavori: quanti } : null;
}

/**
 * I preventivi e il costo di ogni TRATTATIVA, con la risalita dagli ordini.
 * La chiave è l'id con cui l'elenco trattative chiama le sue righe: l'uuid per
 * quelle di Scout, `hs_<id>` per quelle di HubSpot.
 */
export function perTrattativa(
  lavori: LavoroConPreventivi[],
  ordini: { id: string; deal_id?: string | null; hubspot_deal_id?: string | null }[],
): Map<string, { riepilogo: RiepilogoPreventivi; costo: CostoDeiLavori | null }> {
  const dealDellOrdine = new Map<string, string>();
  for (const o of ordini) {
    const d = o.deal_id ? o.deal_id : o.hubspot_deal_id ? `hs_${o.hubspot_deal_id}` : null;
    if (d) dealDellOrdine.set(o.id, d);
  }
  const gruppi = new Map<string, LavoroConPreventivi[]>();
  for (const l of lavori) {
    const deal = trattativaDelLavoro(l, dealDellOrdine);
    if (!deal) continue;
    const g = gruppi.get(deal);
    if (g) g.push(l);
    else gruppi.set(deal, [l]);
  }
  const out = new Map<string, { riepilogo: RiepilogoPreventivi; costo: CostoDeiLavori | null }>();
  for (const [deal, suoi] of gruppi) {
    out.set(deal, { riepilogo: riepilogoDeiLavori(suoi), costo: costoDeiLavori(suoi) });
  }
  return out;
}

/** Come sopra, ma indicizzato per `deal:<id>` / `richiesta:<id>` / `ordine:<id>`. */
export function costiPerChiave(lavori: LavoroConPreventivi[]): Map<string, CostoTrattativa> {
  const perDeal = new Map<string, CostoTrattativa>();
  /** I fornitori DISTINTI di ogni vendita: l'etichetta li conta, non i lavori. */
  const nomi = new Map<string, Set<string>>();
  for (const l of lavori) {
    const chiave = chiaveVendita(l);
    if (!chiave) continue;
    const { preventivo: migliore, scelto } = preventivoDecisivo(l);
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
