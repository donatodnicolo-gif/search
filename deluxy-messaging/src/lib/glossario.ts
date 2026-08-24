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
  negozioId: string
  negozioNome: string
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
  negozioId?: string
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
  negozioId: string
  corretta: boolean
} {
  const termine = (c.termine ?? '').trim() || p.termine
  const definizione = (c.definizione ?? '').trim() || p.definizione
  const categoria = (c.categoria ?? '').trim() || p.categoria
  // ⚠️⚠️ IL BRAND SI LEGGE SOLO SE È STATO MANDATO, e la differenza conta: qui
  // la stringa VUOTA è un valore vero («vale per tutti i marchi»), non un campo
  // non compilato. Con il solito `|| p.negozioId` non si potrebbe più allargare
  // a tutti una proposta nata per un negozio — il vuoto verrebbe scambiato per
  // «non me l'hanno detto» e ricadrebbe sul brand di partenza.
  const negozioId = c.negozioId === undefined ? p.negozioId : (c.negozioId ?? '').trim()
  return {
    termine,
    definizione,
    categoria,
    negozioId,
    corretta:
      termine !== p.termine ||
      definizione !== p.definizione ||
      categoria !== p.categoria ||
      // ⚠️ Cambiare il brand È una correzione, anche a testo identico: cambia a
      // CHI quella frase si può dire, che è il senso della voce.
      negozioId !== p.negozioId,
  }
}
