// Il glossario: i fatti che servono a chi risponde a un cliente.
//
// ⚠️⚠️ **Non è un doppione**, e la distinzione va difesa o in sei mesi ci sono
// quattro posti dove cercare la stessa cosa:
//   · uno **Script** è un testo che si manda (il *cosa si dice*);
//   · un'**istruzione CS AI** dice come l'AI si comporta (il *come*);
//   · un **documento AI** è un file da cui l'AI impara;
//   · una **voce di glossario** è un **fatto** — «a Milano si consegna anche la
//     domenica» — cioè quello che devi sapere per scrivere il testo giusto.
//
// ⚠️⚠️ **Quello che l'app sa già NON si scrive qui.** Domini, numeri WhatsApp,
// caselle, siti del widget e quota del fornitore si leggono ogni volta dalla
// configurazione (`comeSiamoFatti`). Copiarli in una voce vorrebbe dire che il
// giorno in cui cambiano il glossario **mente** — ed è il modo più veloce per
// far smettere la gente di fidarsene.
//
// ⚠️⚠️ **Qui dentro non si parla col database.** Questo file lo importa anche la
// pagina, che è un componente client: un `import { db }` trascinerebbe Prisma
// nel bundle del browser e la build fallisce con «node:crypto non gestito». Le
// query stanno in `src/app/api/glossario/route.ts`. È la terza volta che questa
// separazione serve (turni, refusi, glossario): è una regola, non un caso.

export const CATEGORIE = [
  {
    chiave: 'cliente',
    nome: 'Si può dire al cliente',
    spiega: 'Fatti che si possono riportare a chi scrive: tempi, coperture, come funziona.',
  },
  {
    chiave: 'tecnico',
    nome: 'Interno',
    spiega:
      'Come funziona di dentro: sigle, passaggi, chi fa cosa. ⚠️ Non si legge a un cliente.',
  },
] as const

export type ChiaveCategoria = (typeof CATEGORIE)[number]['chiave']

export function categoriaValida(v: string): v is ChiaveCategoria {
  return CATEGORIE.some((c) => c.chiave === v)
}

export type VoceDto = {
  id: string
  termine: string
  definizione: string
  categoria: string
  /** I marchi a cui vale. **Lista vuota = vale per tutti.** */
  negoziIds: string[]
  /** Gli stessi, coi nomi da mostrare. */
  negoziNomi: string[]
  fonte: string
  conversazioneId: string
  autoreNome: string
  aggiornatoIl: string
}

export type PropostaDto = {
  id: string
  tipo: string
  voceId: string
  termine: string
  definizione: string
  categoria: string
  negozioId: string
  negozioNome: string
  perche: string
  conversazioneId: string
  creatoIl: string
}

// ── CHE COSA SI SCRIVE ACCETTANDO UNA PROPOSTA ──

/** Solo i campi che servono a decidere: il resto della richiesta non c'entra. */
export type CorrezioneProposta = {
  termine?: string
  definizione?: string
  categoria?: string
  /** I marchi scelti. Lista VUOTA = vale per tutti; `undefined` = non toccare. */
  negoziIds?: string[]
}

// ── I MARCHI DI UNA VOCE ──
//
// ⚠️⚠️ Una lista VUOTA vuol dire «vale per TUTTI i marchi», non «per nessuno».
// È il contrario di quello che verrebbe da pensare guardando un array vuoto, e
// sbagliarlo qui vuol dire far sparire dal glossario le voci più importanti —
// quelle generali — oppure raccontarle a chi non riguardano.

/** Vale per tutti i marchi. */
export function valePerTutti(ids: string[] | null | undefined): boolean {
  return !ids || ids.length === 0
}

/** La voce vale per QUESTO marchio? (`''` = sto guardando senza filtro) */
export function valePer(ids: string[], marchio: string): boolean {
  if (valePerTutti(ids)) return true
  if (!marchio) return true
  return ids.includes(marchio)
}

/**
 * Due voci si darebbero fastidio, sì o no.
 *
 * ⚠️⚠️ Serve perché col passaggio ai marchi multipli è caduto il vincolo di
 * unicità su (termine, marchio): due voci con lo stesso termine e marchi
 * DIVERSI sono legittime — «consegna gratuita» può dire una cosa per Cake e
 * un'altra per Deluxy. Quello che NON va bene è che si sovrappongano, perché
 * allora chi legge il glossario trova due risposte alla stessa domanda per lo
 * stesso marchio e non sa quale vale.
 *
 * ⚠️ Una lista vuota («tutti») si sovrappone con QUALUNQUE altra, compresa
 * un'altra vuota: è il caso che si dimentica, ed è quello che riempie il
 * glossario di doppioni globali.
 */
export function marchiSiSovrappongono(a: string[], b: string[]): boolean {
  if (valePerTutti(a) || valePerTutti(b)) return true
  return a.some((x) => b.includes(x))
}

/** Come si scrivono i marchi di una voce, per chi legge. */
export function marchiScritti(ids: string[], nomi: Map<string, string>): string {
  if (valePerTutti(ids)) return 'tutti i marchi'
  return ids.map((id) => nomi.get(id) ?? id).join(' · ')
}

/**
 * Che cosa si scrive davvero in glossario accettando una proposta.
 *
 * ⚠️⚠️ Chi accetta può aver corretto il testo. Prima si poteva solo prendere o
 * lasciare: con una proposta giusta all'80% — il fatto è quello, la frase no —
 * l'unica strada era **scartarla** e riscrivere la voce da capo, cioè buttare
 * via anche la parte buona e la prova (la conversazione da cui nasce).
 *
 * ⚠️ Se il testo è cambiato lo si SCRIVE: `corretta`. Senza, l'archivio direbbe
 * «proposta dall'AI e accettata» anche su una frase riscritta da capo —
 * racconterebbe un'AI più precisa di quella che è, e nessuno saprebbe che il
 * prompt va cambiato.
 */
export function testoDaScrivere(
  p: { termine: string; definizione: string; categoria: string; negozioId: string },
  c: CorrezioneProposta
): {
  termine: string
  definizione: string
  categoria: string
  negoziIds: string[]
  corretta: boolean
} {
  const termine = (c.termine ?? '').trim() || p.termine
  const definizione = (c.definizione ?? '').trim() || p.definizione
  const categoria = (c.categoria ?? '').trim() || p.categoria
  // ⚠️⚠️ I MARCHI SI LEGGONO SOLO SE SONO STATI MANDATI, e la differenza conta:
  // qui la lista VUOTA è un valore vero («vale per tutti i marchi»), non un
  // campo non compilato. Col solito `|| p.negozioId` il vuoto verrebbe
  // scambiato per «non me l'hanno detto» e ricadrebbe sul marchio di partenza:
  // allargare a tutti una voce nata per un negozio sarebbe **impossibile**, in
  // silenzio.
  const propostiDaAi = p.negozioId ? [p.negozioId] : []
  const negoziIds =
    c.negoziIds === undefined
      ? propostiDaAi
      : // ⚠️ Si ripuliscono e si tolgono i doppioni: la schermata manda quello
        // che ha spuntato, e due volte lo stesso marchio non vuol dire niente.
        [...new Set(c.negoziIds.map((x) => (x ?? '').trim()).filter(Boolean))]
  return {
    termine,
    definizione,
    categoria,
    negoziIds,
    corretta:
      termine !== p.termine ||
      definizione !== p.definizione ||
      categoria !== p.categoria ||
      // ⚠️ Cambiare i marchi È una correzione, anche a testo identico: cambia a
      // CHI quella frase si può dire, che è il senso della voce.
      !stessiMarchi(negoziIds, propostiDaAi),
  }
}

/** Due liste di marchi dicono la stessa cosa (l'ordine non conta). */
export function stessiMarchi(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(b)
  return a.every((x) => s.has(x))
}
