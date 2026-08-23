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
