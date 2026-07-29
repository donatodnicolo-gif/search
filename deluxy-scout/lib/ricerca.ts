// RICERCA GLOBALE — una casella sola che cerca in tutta l'app.
//
// Prima ogni sezione aveva la sua ricerca e nessuna cercava fuori da sé: per
// trovare «Gucci» bisognava sapere in anticipo se era un negozio, un referente
// in rubrica, una trattativa o un ordine — cioè sapere già la risposta.
//
// Come funziona: una query per fonte, tutte in parallelo, ognuna con un tetto
// basso. Il risultato è un elenco piatto di righe uguali fra loro (tipo, cosa,
// dove porta), così la schermata non deve sapere niente delle tabelle.
//
// ⚠️ **Ogni fonte è best-effort.** Se una tabella non esiste ancora (migrazione
// non applicata) o la RLS la nega, quella fonte torna vuota e le altre
// rispondono lo stesso: una ricerca che si spegne tutta perché manca una
// tabella è peggio di una ricerca parziale.
//
// ⚠️ I task sono **privati** (RLS `owner = auth.uid()`): qui escono solo i
// propri, ed è giusto così — non è un buco, è la regola della tabella.
import { supabase } from '@/lib/supabase';

export type TipoRisultato =
  | 'negozio'
  | 'contatto'
  | 'trattativa'
  | 'lead'
  | 'ordine'
  | 'task'
  | 'pagamento'
  | 'script'
  | 'sequenza';

export interface Risultato {
  tipo: TipoRisultato;
  id: string;
  titolo: string;
  sottotitolo: string | null;
  /** Dove porta il tocco. Rotta già pronta per `router.push`. */
  rotta: string;
}

export const LABEL_TIPO_RIS: Record<TipoRisultato, string> = {
  negozio: 'Negozi',
  contatto: 'Rubrica',
  trattativa: 'Trattative',
  lead: 'Richieste web',
  ordine: 'Ordini',
  task: 'I miei task',
  pagamento: 'Pagamenti',
  script: 'Script',
  sequenza: 'Sequenze',
};

/** L'ordine in cui mostrare i gruppi: prima quello che si cerca più spesso. */
const ORDINE: TipoRisultato[] = [
  'negozio',
  'contatto',
  'trattativa',
  'lead',
  'ordine',
  'task',
  'pagamento',
  'script',
  'sequenza',
];

export const ICONA_TIPO_RIS: Record<TipoRisultato, string> = {
  negozio: 'storefront-outline',
  contatto: 'person-outline',
  trattativa: 'briefcase-outline',
  lead: 'globe-outline',
  ordine: 'receipt-outline',
  task: 'checkmark-circle-outline',
  pagamento: 'wallet-outline',
  script: 'mail-outline',
  sequenza: 'git-branch-outline',
};

const PER_FONTE = 6;

/**
 * PostgREST: dentro un `or(...)` la virgola separa le condizioni e le parentesi
 * raggruppano. Un termine che le contiene romperebbe la query — o peggio, la
 * cambierebbe. Si tolgono, insieme al `%` che è il jolly di `ilike`.
 */
function pulisci(term: string): string {
  return term.trim().replace(/[,()%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Una fonte che fallisce non deve spegnere la ricerca. */
async function prova<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await p;
    if (error) return [];
    return (data ?? []) as T[];
  } catch {
    return [];
  }
}

/**
 * Cerca il termine ovunque. Torna le righe già ordinate per gruppo.
 * Sotto i 2 caratteri non cerca: con una lettera sola tornerebbe mezza app.
 */
export async function cercaOvunque(term: string): Promise<Risultato[]> {
  const q = pulisci(term);
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const negozi = await prova(
    supabase
      .from('places')
      .select('id, nome, indirizzo, zona')
      .or(`nome.ilike.${like},indirizzo.ilike.${like},zona.ilike.${like}`)
      .not('nascosto', 'is', true)
      .order('nome')
      .limit(PER_FONTE),
  );
  const idNegozi = negozi.map((n: any) => n.id as string);

  // Le trattative e gli ordini si cercano anche **per negozio**: è così che
  // uno li cerca davvero («la trattativa della Gucci»), e il nome del negozio
  // sta in un'altra tabella. Gli id dei negozi trovati sopra evitano di dover
  // filtrare su una tabella agganciata, che PostgREST non combina con `or`.
  const [contatti, trattativeTesto, trattativeNegozio, lead, ordini, task, pagamenti, script, sequenze] =
    await Promise.all([
      prova(
        supabase
          .from('contacts')
          .select('id, nome, ruolo, telefono, email, place_id, places(nome)')
          .or(`nome.ilike.${like},ruolo.ilike.${like},telefono.ilike.${like},email.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      prova(
        supabase
          .from('deals')
          .select('id, linea, fase, oggetto, next_action, place_id, places(nome)')
          .or(`linea.ilike.${like},oggetto.ilike.${like},next_action.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      idNegozi.length
        ? prova(
            supabase
              .from('deals')
              .select('id, linea, fase, oggetto, next_action, place_id, places(nome)')
              .in('place_id', idNegozi)
              .limit(PER_FONTE),
          )
        : Promise.resolve([] as any[]),
      prova(
        supabase
          .from('leads')
          .select('id, nome, contatto, fonte, stato')
          .or(`nome.ilike.${like},contatto.ilike.${like},messaggio.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      prova(
        supabase
          .from('ordini')
          .select('id, cliente, descrizione, valore, stato')
          .or(`cliente.ilike.${like},descrizione.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      prova(
        supabase
          .from('tasks')
          .select('id, titolo, note, scadenza, completata')
          .or(`titolo.ilike.${like},note.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      // ⚠️ La colonna è `cliente` (chi deve pagare), NON `beneficiario`: la
      // 0025 aveva un beneficiario con IBAN — soldi in uscita — ma la 0027 ha
      // **ricreato la tabella da zero** ribaltandone il senso (è una richiesta
      // di incasso al cliente). Scritto qui perché il nome vecchio è ancora in
      // giro nella 0025 e sembra plausibile.
      prova(
        supabase
          .from('richieste_pagamento')
          .select('id, cliente, causale, importo, stato')
          .or(`cliente.ilike.${like},causale.ilike.${like},nota.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      prova(
        supabase
          .from('script_email')
          .select('id, titolo, oggetto')
          .or(`titolo.ilike.${like},oggetto.ilike.${like},corpo.ilike.${like}`)
          .limit(PER_FONTE),
      ),
      prova(
        supabase
          .from('sequenze')
          .select('id, nome, descrizione')
          .or(`nome.ilike.${like},descrizione.ilike.${like}`)
          .limit(PER_FONTE),
      ),
    ]);

  const out: Risultato[] = [];

  for (const n of negozi as any[]) {
    out.push({
      tipo: 'negozio',
      id: n.id,
      titolo: n.nome,
      sottotitolo: [n.indirizzo, n.zona].filter(Boolean).join(' · ') || null,
      rotta: `/(app)/attivita/${n.id}`,
    });
  }

  for (const c of contatti as any[]) {
    out.push({
      tipo: 'contatto',
      id: c.id,
      titolo: c.nome,
      sottotitolo: [c.places?.nome, c.ruolo, c.telefono ?? c.email].filter(Boolean).join(' · ') || null,
      // Porta alla scheda del negozio: è lì che vive il referente.
      rotta: c.place_id ? `/(app)/attivita/${c.place_id}` : '/(app)/rubrica',
    });
  }

  // Le due liste di trattative si sovrappongono quando il termine combacia sia
  // col testo sia col negozio: si tiene una riga sola per id.
  const vistaDeal = new Set<string>();
  for (const d of [...(trattativeTesto as any[]), ...(trattativeNegozio as any[])]) {
    if (vistaDeal.has(d.id)) continue;
    vistaDeal.add(d.id);
    out.push({
      tipo: 'trattativa',
      id: d.id,
      titolo: d.places?.nome ?? d.oggetto ?? 'Trattativa',
      sottotitolo: [d.oggetto, d.linea, d.next_action].filter(Boolean).join(' · ') || null,
      rotta: '/(app)/trattative',
    });
  }

  for (const l of lead as any[]) {
    out.push({
      tipo: 'lead',
      id: l.id,
      titolo: l.nome,
      sottotitolo: [l.contatto, l.fonte, l.stato].filter(Boolean).join(' · ') || null,
      rotta: '/(app)/lead',
    });
  }

  for (const o of ordini as any[]) {
    out.push({
      tipo: 'ordine',
      id: o.id,
      titolo: o.cliente,
      sottotitolo:
        [o.descrizione, o.valore != null ? `€ ${Number(o.valore).toLocaleString('it-IT')}` : null, o.stato]
          .filter(Boolean)
          .join(' · ') || null,
      rotta: '/(app)/ordini',
    });
  }

  for (const t of task as any[]) {
    out.push({
      tipo: 'task',
      id: t.id,
      titolo: t.titolo,
      sottotitolo:
        [t.scadenza ? `entro il ${new Date(t.scadenza).toLocaleDateString('it-IT')}` : null, t.completata ? 'fatto' : null]
          .filter(Boolean)
          .join(' · ') || null,
      rotta: '/(app)/task',
    });
  }

  for (const p of pagamenti as any[]) {
    out.push({
      tipo: 'pagamento',
      id: p.id,
      titolo: p.cliente,
      sottotitolo:
        [p.causale, p.importo != null ? `€ ${Number(p.importo).toLocaleString('it-IT')}` : null, p.stato]
          .filter(Boolean)
          .join(' · ') || null,
      rotta: '/(app)/pagamenti',
    });
  }

  for (const s of script as any[]) {
    out.push({ tipo: 'script', id: s.id, titolo: s.titolo, sottotitolo: s.oggetto ?? null, rotta: '/(app)/script' });
  }

  for (const s of sequenze as any[]) {
    out.push({ tipo: 'sequenza', id: s.id, titolo: s.nome, sottotitolo: s.descrizione ?? null, rotta: '/(app)/sequenze' });
  }

  return out.sort((a, b) => ORDINE.indexOf(a.tipo) - ORDINE.indexOf(b.tipo));
}
