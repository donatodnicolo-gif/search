// CATEGORIE DI PRODOTTO — di cosa è fatto un ordine, e quindi cosa piace a un
// cliente («ama solo i fiori» o «compra fiori e pasticceria»).
//
// PERCHÉ NON ARRIVANO DA SHOPIFY. Il tipo di prodotto (`product.productType`)
// richiede lo scope `read_products`, che i token non hanno — chiederlo faceva
// fallire l'intero import. Resta il **titolo della riga d'ordine**, che è un
// dato strutturato (il nome del prodotto, non testo libero) ma scritto per il
// cliente, non per una macchina.
//
// COME SI CLASSIFICA, in ordine:
//  1. **parole del titolo**: «Bouquet Rose Rosse» → fiori, «Crostata di Frutta»
//     → torte. Copre il 79% delle righe;
//  2. **specialità del negozio** (`NegozioShopify.categoriaPredefinita`): un
//     prodotto che non si riconosce, su un negozio che vende una cosa sola, è
//     quella cosa. Si imposta in Impostazioni, negozio per negozio, e chi non
//     la imposta non subisce nessuna deduzione;
//  3. altrimenti **«non classificato»**, e si vede quanto pesa.
//
// COSA NON SI FA: indovinare i nomi propri. I prodotti più venduti si chiamano
// «Botticelli - Nascita di Venere», «Favolosa», «Alexander»: nel nome non c'è
// niente che dica cosa sono. Metterli a mano in un elenco qui dentro
// significherebbe riscriverlo a ogni collezione nuova — meglio dire «non
// classificato» e mostrare quali sono, che inventarsi una categoria.

export type Categoria = {
  chiave: string;
  nome: string;
  colore: string;
  // Le parole che la riconoscono nel titolo (espressione regolare Postgres).
  parole: string;
  // `true` = non è un gusto del cliente ma una voce di servizio: non conta
  // quando si guarda «di quante categorie è amante».
  servizio?: boolean;
};

// L'ordine conta: si applica la prima che riconosce il titolo. «Torta di rose»
// è una torta, non un mazzo di fiori — per questo le voci di servizio e le
// categorie più specifiche stanno sopra.
export const CATEGORIE: Categoria[] = [
  {
    chiave: "servizio",
    nome: "Servizio",
    colore: "var(--text-tertiary)",
    servizio: true,
    parole: `(servizio|extra|additional[ _]price|_additional|spedizion|costo di consegna|supplement|personalizzazion|crea la tua|biglietto|card\\M|confezion)`,
  },
  {
    chiave: "colazione",
    nome: "Colazioni",
    colore: "var(--gold-strong)",
    parole: `(colazione|breakfast|brunch|merenda)`,
  },
  {
    chiave: "torte",
    nome: "Torte e pasticceria",
    colore: "var(--purple)",
    parole: `(torta|torte|cake|crostata|sacher|chantilly|cheesecake|tiramis|pasticc|millefoglie|profiterol|red velvet|pavlova|saint honor|mignon|bignè|bigne|semifreddo|gelato|cannol|babà|baba\\M|maritozz)`,
  },
  {
    chiave: "fiori",
    nome: "Fiori e piante",
    colore: "var(--green)",
    parole: `(bouquet|rose\\M|rosa\\M|rose |peoni|ortensi|girasol|tulipan|orchide|fiori|fiore|flower|mazzo|bocciol|lilium|gerber|garofan|anthurium|pianta|piante|composizione floreale|floreal|centrotavola|ranuncol|calle\\M|margherit|lisianthus|eucalipt)`,
  },
  {
    chiave: "dolci",
    nome: "Dolci e cioccolato",
    colore: "var(--orange)",
    parole: `(cioccolat|pralin|macaron|gianduia|dolci|dolce\\M|caramell|biscott|cupcake|donut|colomba|panettone|uovo di pasqua|nutella|lindt|ferrero)`,
  },
  {
    chiave: "salato",
    nome: "Salato e sushi",
    colore: "var(--blue)",
    parole: `(sushi|roll\\M|rolls|tempura|sashimi|poke|tagliere|salumi|formagg|pizza|focacc|aperitivo|finger food)`,
  },
  {
    chiave: "bollicine",
    nome: "Vini e bollicine",
    colore: "var(--red)",
    parole: `(champagne|prosecco|spumante|vino\\M|vini\\M|bollicine|moet|moët|veuve|dom p|ferrari trento|franciacorta|gin\\M|rum\\M|whisky|liquore)`,
  },
  {
    chiave: "regali",
    nome: "Regali e complementi",
    colore: "var(--gold)",
    parole: `(pallonc|balloon|candel|profumo|peluche|orsacchiott|gift|regalo|cofanett|scatola|vaso\\M|diffusore|bagno|beauty|cornice)`,
  },
];

export function nomeCategoria(c: string): string {
  if (c === "non-classificato") return "Non classificato";
  return CATEGORIE.find((x) => x.chiave === c)?.nome ?? c;
}

export function coloreCategoria(c: string): string {
  if (c === "non-classificato") return "var(--text-tertiary)";
  return CATEGORIE.find((x) => x.chiave === c)?.colore ?? "var(--text-secondary)";
}

// Le categorie che dicono qualcosa sui gusti di un cliente: il «servizio» no
// (nessuno è amante delle spese di spedizione) e nemmeno il non classificato.
export const CATEGORIE_GUSTO = CATEGORIE.filter((c) => !c.servizio).map((c) => c.chiave);

// La stessa classificazione, in SQL: serve sia per ricalcolare l'archivio in
// una query sola sia per non avere due regole diverse che dicono cose diverse.
// `colonna` è l'espressione col titolo, `predefinita` quella con la specialità
// del negozio (può essere NULL).
// L'ordine di precedenza, dal più forte al più debole:
//  1. quello che ha detto una PERSONA (CategoriaProdotto, origine `manuale`);
//  2. le PAROLE del titolo: deterministiche, si leggono, non cambiano da sole;
//  3. la proposta dell'**AI** sul singolo prodotto (origine `ai`);
//  4. i TAG dell'ordine: «Fiori», «Torta», «Colazione» sono etichette che una
//     persona ha messo sull'ordine intero. Valgono meno del titolo — dicono
//     come il negozio chiama quell'ordine, non che cosa c'è nella scatola — ma
//     molto più della specialità del negozio, e recuperano gli ordini il cui
//     prodotto si chiama «Botticelli»;
//  5. la SPECIALITÀ del negozio;
//  6. «non classificato», che è una risposta onesta.
// `prodotto` è l'alias della tabella CategoriaProdotto già in join (o `NULL` se
// chi chiama non ce l'ha); `tag` è l'espressione coi tag dell'ordine.
export function sqlCategoria(
  colonna: string,
  predefinita: string,
  prodotto?: string,
  tag?: string,
): string {
  const caso = (espressione: string) =>
    `CASE\n      ${CATEGORIE.map((c) => `WHEN ${espressione} ~* '${c.parole}' THEN '${c.chiave}'`).join("\n      ")}\n      ELSE NULL\n    END`;
  const dalleParole = caso(colonna);
  const daiTag = tag ? caso(tag) : "NULL";
  const manuale = prodotto ? `CASE WHEN ${prodotto}."origine" = 'manuale' THEN ${prodotto}."categoria" END` : "NULL";
  const dallAI = prodotto ? `${prodotto}."categoria"` : "NULL";
  return `COALESCE(
    ${manuale},
    ${dalleParole},
    ${dallAI},
    ${daiTag},
    NULLIF(${predefinita}, ''),
    'non-classificato'
  )`;
}

// La stessa cosa in TypeScript, per la sync (che ha le righe in memoria).
export function categoriaDaTitolo(titolo: string, predefinita?: string | null): string {
  for (const c of CATEGORIE) {
    if (new RegExp(c.parole.replace(/\\M/g, "\\b"), "i").test(titolo)) return c.chiave;
  }
  return predefinita?.trim() || "non-classificato";
}

// Le categorie di un ordine, come stringa: «dolci fiori». In ordine alfabetico
// — lo stesso che usa Postgres in `string_agg(DISTINCT …)` — così la stringa
// scritta dalla sync e quella scritta dal ricalcolo sono identiche e non si
// riscrivono a vicenda a ogni giro.
export function categorieOrdine(titoli: string[], predefinita?: string | null, tag?: string | null): string {
  // Stessa precedenza della versione SQL: prima le parole del titolo, poi i tag
  // dell'ordine, e solo alla fine la specialità del negozio.
  const daiTag = tag ? dalleParole(tag) : null;
  const trovate = new Set(
    titoli.map((t) => dalleParole(t) ?? daiTag ?? predefinita?.trim() ?? "non-classificato"),
  );
  return [...trovate].sort().join(" ");
}

// La categoria che si legge nelle parole di un testo, o `null` se non ce n'è.
function dalleParole(testo: string): string | null {
  for (const c of CATEGORIE) {
    if (new RegExp(c.parole.replace(/\\M/g, "\\b"), "i").test(testo)) return c.chiave;
  }
  return null;
}

// Ricalcola le categorie di TUTTI gli ordini partendo dalle righe già salvate.
// Non chiama Shopify: i titoli sono già qui. Una query sola, e riscrive solo
// gli ordini in cui il risultato è cambiato davvero.
export async function ricalcolaCategorie(): Promise<{ aggiornati: number }> {
  const { prisma, tabella } = await import("./db");
  const { Prisma } = await import("@prisma/client");
  const caso = Prisma.raw(sqlCategoria(`r."titolo"`, `n."categoriaPredefinita"`, "cp", `o2."tagShopify"`));

  const aggiornati = await prisma.$executeRaw(Prisma.sql`
    UPDATE ${tabella("Ordine")} o
    SET "categorie" = x.cat
    FROM (
      SELECT r."ordineId" AS id, STRING_AGG(DISTINCT ${caso}, ' ') AS cat
      FROM ${tabella("RigaOrdine")} r
      JOIN ${tabella("Ordine")} o2 ON o2.id = r."ordineId"
      JOIN ${tabella("NegozioShopify")} n ON n.id = o2."negozioId"
      LEFT JOIN ${tabella("CategoriaProdotto")} cp ON cp."titolo" = r."titolo"
      GROUP BY r."ordineId"
    ) x
    WHERE o.id = x.id AND o."categorie" IS DISTINCT FROM x.cat
  `);
  return { aggiornati };
}
