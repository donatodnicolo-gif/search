// SEQUENZE — i solleciti che si ricordano da soli.
//
// Una sequenza è una serie di passi: «questo testo, poi dopo 5 giorni
// quest'altro, poi dopo 10 il terzo». Si iscrive un negozio e l'app tiene il
// conto delle scadenze, invece di affidarlo alla memoria di chi vende.
//
// ⚠️ DUE REGOLE CHE NON SI TOCCANO.
//
// 1. **Se il cliente ha risposto, la sequenza si ferma.** Un sollecito che
//    arriva dopo la risposta non è un sollecito, è una figuraccia — e con gli
//    invii a scadenza succede al primo giorno di distrazione. La risposta si
//    verifica leggendo la posta PRIMA di ogni invio (AI Mail, lib/mail.ts),
//    non a campione e non «di solito».
//
// 2. **Niente parte da solo senza che una persona lo veda.** La sequenza
//    calcola cosa è pronto e lo mette in coda; l'invio si conferma. Mandare
//    email a clienti veri, in automatico, senza che nessuno guardi, è il tipo
//    di automatismo che il giorno che sbaglia lo fa su tutta la lista.
import { supabase } from '@/lib/supabase';
import { mailDaContatto } from '@/lib/mail';

export interface Sequenza {
  id: string;
  nome: string;
  descrizione: string | null;
  attiva: boolean;
  created_at: string;
}

/**
 * Un passo dice DUE cose: quale testo mandare e dopo quanti giorni.
 *
 * Il testo può venire da due parti, mai da tutt'e due:
 *  · `script_id` → un modello della libreria Script (condiviso: se lo si
 *    corregge lì, cambia in tutte le sequenze che lo usano);
 *  · `oggetto` + `corpo` → una mail scritta dentro il passo, che in libreria
 *    non ci finisce. È il caso del sollecito di due righe, che come modello
 *    non serve a nessuno.
 * Le variabili tra [ ] valgono identiche nei due casi: le riempie sempre
 * `invio-email` al momento dell'invio (lib/variabili.ts).
 */
export interface PassoSequenza {
  id: string;
  sequenza_id: string;
  ordine: number;
  script_id: string | null;
  oggetto: string | null;
  corpo: string | null;
  giorni_attesa: number;
}

/** Il testo di un passo, da qualunque delle due parti arrivi. */
export interface TestoPasso {
  /** Come chiamarlo nelle liste. */
  titolo: string;
  oggetto: string;
  corpo: string;
  /** L'id del modello, se il testo viene dalla libreria: serve allo storico. */
  scriptId: string | null;
}

/**
 * Risolve il testo di un passo. Torna `null` solo se il passo puntava a un
 * modello che nel frattempo è stato cancellato — caso che va detto a chi manda,
 * non aggirato mandando una mail vuota.
 */
export function testoDelPasso(
  passo: PassoSequenza,
  script: { id: string; titolo: string; oggetto: string | null; corpo: string }[],
): TestoPasso | null {
  if (passo.script_id) {
    const s = script.find((x) => x.id === passo.script_id);
    if (!s) return null;
    return { titolo: s.titolo, oggetto: s.oggetto ?? '', corpo: s.corpo, scriptId: s.id };
  }
  const corpo = (passo.corpo ?? '').trim();
  if (!corpo) return null;
  const oggetto = (passo.oggetto ?? '').trim();
  return { titolo: oggetto || 'Mail del passo', oggetto, corpo, scriptId: null };
}

export interface Iscrizione {
  id: string;
  sequenza_id: string;
  place_id: string;
  passi_fatti: number;
  prossimo_il: string | null;
  stato: 'attiva' | 'risposto' | 'finita' | 'ferma';
  motivo: string | null;
  ultimo_invio_il: string | null;
}

/** Una riga della coda: chi, quale passo, con quale testo, e se è in ritardo. */
export interface InCoda {
  iscrizione: Iscrizione;
  sequenza: Sequenza;
  passo: PassoSequenza;
  placeNome: string;
  /** Giorni di ritardo sulla data prevista (0 = oggi, >0 = in ritardo). */
  ritardo: number;
}

// ─── Sequenze e passi ────────────────────────────────────────────────────────

export async function fetchSequenze(): Promise<Sequenza[]> {
  const { data, error } = await supabase.from('sequenze').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []) as Sequenza[];
}

export async function fetchPassi(sequenzaId: string): Promise<PassoSequenza[]> {
  const { data, error } = await supabase
    .from('sequenza_passi')
    .select('*')
    .eq('sequenza_id', sequenzaId)
    .order('ordine');
  if (error) throw error;
  return (data ?? []) as PassoSequenza[];
}

export async function creaSequenza(nome: string, descrizione?: string): Promise<Sequenza> {
  const { data, error } = await supabase
    .from('sequenze')
    .insert({ nome: nome.trim(), descrizione: descrizione?.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  return data as Sequenza;
}

/** Cosa manda il passo: o un modello della libreria, o una mail scritta qui. */
export type TestoNuovoPasso =
  | { scriptId: string }
  | { oggetto: string; corpo: string };

export async function aggiungiPasso(
  sequenzaId: string,
  testo: TestoNuovoPasso,
  giorniAttesa: number,
): Promise<void> {
  const passi = await fetchPassi(sequenzaId);
  const daLibreria = 'scriptId' in testo;
  if (!daLibreria && !testo.corpo.trim()) throw new Error('La mail del passo è vuota.');
  const { error } = await supabase.from('sequenza_passi').insert({
    sequenza_id: sequenzaId,
    ordine: (passi[passi.length - 1]?.ordine ?? 0) + 1,
    script_id: daLibreria ? testo.scriptId : null,
    oggetto: daLibreria ? null : testo.oggetto.trim() || null,
    corpo: daLibreria ? null : testo.corpo,
    // Il primo passo parte subito: aspettare prima ancora di aver detto la
    // prima parola non ha senso.
    giorni_attesa: passi.length === 0 ? 0 : Math.max(0, Math.round(giorniAttesa)),
  });
  if (error) throw error;
}

/**
 * Toglie un passo. ⚠️ Le iscrizioni in corso NON si spostano: da quando il
 * passo si sceglie per `ordine` e non per posizione (`fetchCoda`), togliere una
 * riga non fa più saltare un colpo a chi è già partito — semplicemente quel
 * passo non toccherà a nessuno.
 */
export async function rimuoviPasso(passoId: string): Promise<void> {
  const { error } = await supabase.from('sequenza_passi').delete().eq('id', passoId);
  if (error) throw error;
}

export async function impostaAttiva(sequenzaId: string, attiva: boolean): Promise<void> {
  const { error } = await supabase.from('sequenze').update({ attiva }).eq('id', sequenzaId);
  if (error) throw error;
}

export async function eliminaSequenza(sequenzaId: string): Promise<void> {
  const { error } = await supabase.from('sequenze').delete().eq('id', sequenzaId);
  if (error) throw error;
}

// ─── Iscrizioni ──────────────────────────────────────────────────────────────

/** Il giorno (YYYY-MM-DD) fra N giorni. Niente toISOString: converte in UTC e
 *  in Italia, di sera, sposta la data al giorno prima. */
function fraGiorni(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Iscrive un negozio a una sequenza. Il primo passo viene messo in coda per la
 * data che gli spetta (di norma oggi).
 *
 * Se il negozio è già iscritto non si duplica: due solleciti in parallelo allo
 * stesso indirizzo sono il modo più veloce di bruciare un contatto.
 */
export async function iscrivi(sequenzaId: string, placeId: string): Promise<{ nuova: boolean }> {
  const passi = await fetchPassi(sequenzaId);
  if (!passi.length) throw new Error('La sequenza non ha ancora nessun passo.');
  const { data: gia } = await supabase
    .from('sequenza_iscrizioni')
    .select('id')
    .eq('sequenza_id', sequenzaId)
    .eq('place_id', placeId)
    .maybeSingle();
  if (gia) return { nuova: false };
  const { error } = await supabase.from('sequenza_iscrizioni').insert({
    sequenza_id: sequenzaId,
    place_id: placeId,
    passi_fatti: 0,
    prossimo_il: fraGiorni(passi[0].giorni_attesa),
    stato: 'attiva',
  });
  if (error) throw error;
  return { nuova: true };
}

export async function fermaIscrizione(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('sequenza_iscrizioni')
    .update({ stato: 'ferma', prossimo_il: null, motivo })
    .eq('id', id);
  if (error) throw error;
}

export async function riprendiIscrizione(id: string): Promise<void> {
  const { error } = await supabase
    .from('sequenza_iscrizioni')
    .update({ stato: 'attiva', prossimo_il: fraGiorni(0), motivo: null })
    .eq('id', id);
  if (error) throw error;
}

// ─── La coda ─────────────────────────────────────────────────────────────────

/**
 * Gli ORDINI dei passi già partiti davvero, per iscrizione.
 *
 * ⚠️ «Partito davvero» vuol dire una riga di `sequenza_invii` con almeno un
 * invio riuscito e senza errore: un tentativo fallito non fa avanzare la
 * sequenza, o il negozio salterebbe un colpo senza che nessuno se ne accorga.
 */
async function invatiPerIscrizione(iscrizioni: string[]): Promise<Map<string, Set<number>>> {
  const out = new Map<string, Set<number>>();
  if (!iscrizioni.length) return out;
  const { data, error } = await supabase
    .from('sequenza_invii')
    .select('iscrizione_id, passo_ordine, inviate, errore')
    .in('iscrizione_id', iscrizioni);
  if (error) throw error;
  for (const r of (data ?? []) as any[]) {
    if (r.errore || !r.inviate) continue;
    if (!out.has(r.iscrizione_id)) out.set(r.iscrizione_id, new Set<number>());
    out.get(r.iscrizione_id)!.add(r.passo_ordine);
  }
  return out;
}

/** Chiude un'iscrizione che non ha più passi da mandare. */
async function chiudiIscrizioneFinita(id: string): Promise<void> {
  const { error } = await supabase
    .from('sequenza_iscrizioni')
    .update({ stato: 'finita', prossimo_il: null, motivo: 'Tutti i passi sono stati mandati' })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Cosa è pronto a partire: le iscrizioni attive la cui data è arrivata (o
 * passata). Include il ritardo, perché una sequenza dimenticata da dieci giorni
 * va guardata prima di una di oggi.
 */
export async function fetchCoda(): Promise<InCoda[]> {
  const oggi = fraGiorni(0);
  const { data, error } = await supabase
    .from('sequenza_iscrizioni')
    .select('*, sequenze(*), places(nome)')
    .eq('stato', 'attiva')
    .not('prossimo_il', 'is', null)
    .lte('prossimo_il', oggi)
    .order('prossimo_il');
  if (error) throw error;

  const righe = (data ?? []) as any[];
  // I passi di tutte le sequenze coinvolte, in una volta sola: chiederli per
  // ogni riga sarebbe una query per negozio.
  const sequenzeId = [...new Set(righe.map((r) => r.sequenza_id))];
  const passiPerSequenza = new Map<string, PassoSequenza[]>();
  for (const sid of sequenzeId) passiPerSequenza.set(sid, await fetchPassi(sid));

  // ⚠️ QUALE PASSO TOCCA: si guarda cosa è GIÀ PARTITO, non quanti ne sono
  // partiti (corretto il 27/08/2026). Prima il passo si sceglieva per posizione
  // — `passi[passi_fatti]` — ma `passi_fatti` è un contatore storico e i passi
  // si possono cancellare: togliendo il secondo di tre, chi ne aveva ricevuto
  // uno riceveva il TERZO saltando quello di mezzo, e chi ne aveva ricevuti due
  // trovava `undefined`, spariva dalla coda e restava «attiva» per sempre — né
  // finita né ripartibile. La verità sta in `sequenza_invii`, che registra
  // l'ORDINE di ogni passo davvero mandato.
  const inviati = await invatiPerIscrizione(righe.map((r) => r.id));

  const out: InCoda[] = [];
  for (const r of righe) {
    const sequenza = r.sequenze as Sequenza;
    if (!sequenza?.attiva) continue; // sequenza spenta: non deve partire niente
    const passi = passiPerSequenza.get(r.sequenza_id) ?? [];
    const gia = inviati.get(r.id) ?? new Set<number>();
    const passo = passi.find((p) => !gia.has(p.ordine));
    if (!passo) {
      // Non c'è più niente da mandare: la si CHIUDE qui, invece di lasciarla
      // sospesa. Prima questo ramo era un `continue` muto e l'iscrizione
      // restava «attiva» con una data di partenza che non sarebbe mai arrivata.
      await chiudiIscrizioneFinita(r.id);
      continue;
    }
    const giorni = Math.round(
      (Date.parse(oggi) - Date.parse(r.prossimo_il)) / 86400000,
    );
    out.push({
      iscrizione: r as Iscrizione,
      sequenza,
      passo,
      placeNome: r.places?.nome ?? 'Negozio',
      ritardo: Math.max(0, giorni),
    });
  }
  return out;
}

/**
 * Il cliente ha risposto dopo l'ultimo invio?
 *
 * È il controllo che tiene in piedi tutto: si guarda la posta ricevuta da uno
 * qualsiasi degli indirizzi del negozio dopo la data dell'ultimo invio.
 *
 * ⚠️ Se la posta non è collegata (AI Mail assente o casella non configurata)
 * `mailDaContatto` torna una lista vuota — che è indistinguibile da «non ha
 * risposto». Per questo torna anche `verificabile: false`: chi chiama deve
 * poterlo dire, invece di far credere che il silenzio sia una risposta mancata.
 */
export async function haRisposto(
  emails: string[],
  dopo: string | null,
): Promise<{ risposto: boolean; verificabile: boolean; quando?: string }> {
  const indirizzi = emails.filter(Boolean);
  if (!indirizzi.length || !dopo) return { risposto: false, verificabile: false };
  let verificabile = false;
  for (const email of indirizzi) {
    const msg = await mailDaContatto(email, { da: dopo });
    if (msg.length) verificabile = true;
    // Solo le mail ARRIVATE dopo l'invio: le precedenti sono la conversazione
    // di prima, non una risposta a questo sollecito.
    const risposta = msg.find((m) => Date.parse(m.data) > Date.parse(dopo));
    if (risposta) return { risposto: true, verificabile: true, quando: risposta.data };
  }
  return { risposto: false, verificabile };
}

/** Segna il cliente come «ha risposto»: la sequenza si ferma, ed è un successo. */
export async function segnaRisposto(id: string, quando?: string): Promise<void> {
  const { error } = await supabase
    .from('sequenza_iscrizioni')
    .update({
      stato: 'risposto',
      prossimo_il: null,
      motivo: quando ? `Ha risposto il ${new Date(quando).toLocaleDateString('it-IT')}` : 'Ha risposto',
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Registra un passo mandato e programma il successivo. Se non ce ne sono altri
 * l'iscrizione si chiude come `finita`.
 */
export async function segnaInviato(
  c: InCoda,
  esito: { destinatari: string[]; inviate: number; errore?: string },
): Promise<void> {
  await supabase.from('sequenza_invii').upsert(
    {
      iscrizione_id: c.iscrizione.id,
      passo_ordine: c.passo.ordine,
      script_id: c.passo.script_id,
      destinatari: esito.destinatari,
      inviate: esito.inviate,
      errore: esito.errore ?? null,
    },
    { onConflict: 'iscrizione_id,passo_ordine' },
  );

  // Un invio fallito NON fa avanzare il passo: altrimenti il negozio salterebbe
  // un colpo della sequenza senza che nessuno se ne accorga.
  if (esito.errore || esito.inviate === 0) return;

  const passi = await fetchPassi(c.sequenza.id);
  const fatti = c.iscrizione.passi_fatti + 1;
  // Come nella coda: il prossimo è il primo passo che non è ancora partito,
  // non «quello dopo, contando». `c.passo.ordine` è appena stato registrato
  // sopra, quindi è già dentro l'insieme.
  const gia = (await invatiPerIscrizione([c.iscrizione.id])).get(c.iscrizione.id) ?? new Set<number>();
  const prossimo = passi.find((p) => !gia.has(p.ordine));
  const { error } = await supabase
    .from('sequenza_iscrizioni')
    .update({
      passi_fatti: fatti,
      ultimo_invio_il: new Date().toISOString(),
      prossimo_il: prossimo ? fraGiorni(prossimo.giorni_attesa) : null,
      stato: prossimo ? 'attiva' : 'finita',
      motivo: prossimo ? null : 'Tutti i passi sono stati mandati',
    })
    .eq('id', c.iscrizione.id);
  if (error) throw error;
}

/** Le iscrizioni di un negozio, per mostrarle nella sua scheda. */
export async function fetchIscrizioniPlace(placeId: string): Promise<(Iscrizione & { sequenza: Sequenza })[]> {
  const { data, error } = await supabase
    .from('sequenza_iscrizioni')
    .select('*, sequenze(*)')
    .eq('place_id', placeId);
  if (error) return [];
  return (data ?? []).map((r: any) => ({ ...r, sequenza: r.sequenze })) as any;
}
