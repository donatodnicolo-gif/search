import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import {
  LISTE,
  OCCASIONI,
  SQL_DOMINIO_AZIENDALE,
  SQL_SEGMENTO,
  SQL_TIPOLOGIA_AUTO,
  colonnaConteggio,
  colonnaOccasione,
  colonnaSpesa,
  lista,
} from "./segmenti";

// I clienti non sono una tabella a sé: si ricavano dagli ordini. Un cliente è
// identificato dalla sua email (minuscola); se manca, dal telefono; se manca
// anche quello, dal nome. Così un cliente che ha ordinato dieci volte su brand
// diversi resta una persona sola.
//
// L'aggregazione si fa in SQL (COALESCE + GROUP BY): con decine di migliaia di
// ordini è l'unico modo per restare veloci. Sopra l'aggregato si appoggia la
// CLASSIFICAZIONE (segmento di valore, tipologia, liste): vocabolario e criteri
// stanno in `segmenti.ts`, qui c'è la query che li applica.
//
// DUE COSE DA SAPERE SUI NUMERI:
//  1. ordini, spesa e date **escludono gli ordini annullati** — come le API.
//     Un annullato resta spesso "pagato", quindi contarlo gonfierebbe il valore
//     del cliente e lo farebbe finire fra i VIP per errore. Gli annullati si
//     contano a parte (`annullati`) e hanno una loro lista.
//  2. chi ha SOLO ordini annullati non è un cliente e non compare (163 casi
//     reali su 10.375): non ha mai comprato niente.

export type Cliente = {
  chiave: string;
  nome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ordini: number;
  annullati: number;
  speso: number;
  medio: number;
  primoOrdine: Date;
  ultimoOrdine: Date;
  giorni: number; // giorni dall'ultimo ordine valido
  brand: string[];
  // classificazione
  segmento: string;
  tipologia: string; // quella in vigore (manuale se c'è, altrimenti dedotta)
  tipologiaAuto: string; // quella dedotta dal nome
  tipoManuale: string | null; // impostata a mano da un operatore
  notaTag: string | null;
  dominioAziendale: boolean;
};

// L'espressione che identifica il cliente, condivisa da elenco e dettaglio.
const CHIAVE = Prisma.sql`COALESCE(
  NULLIF(LOWER(TRIM("clienteEmail")), ''),
  NULLIF(TRIM("clienteTelefono"), ''),
  NULLIF(LOWER(TRIM("clienteNome")), '')
)`;

// Un ordine entra nell'elenco clienti solo se ha almeno un dato che identifichi
// la persona. Gli ordini senza email, telefono NÉ nome non sono un cliente: se
// li si raggruppasse comunque, finirebbero tutti in un unico finto cliente da
// centinaia di ordini. Si contano a parte (ordiniSenzaCliente).
const IDENTIFICABILE = Prisma.sql`(
  COALESCE(NULLIF(TRIM("clienteEmail"), ''), NULLIF(TRIM("clienteTelefono"), ''), NULLIF(TRIM("clienteNome"), '')) IS NOT NULL
)`;

// Filtro di ricerca sui clienti: cerca su nome, email, telefono e città.
function dove(q?: string): Prisma.Sql {
  if (!q) return Prisma.empty;
  const like = `%${q}%`;
  return Prisma.sql`AND (
    "clienteNome" ILIKE ${like} OR
    "clienteEmail" ILIKE ${like} OR
    "clienteTelefono" ILIKE ${like} OR
    "spedizioneNome" ILIKE ${like} OR
    "citta" ILIKE ${like}
  )`;
}

// Quanti ordini validi sono caduti in ciascuna finestra di ricorrenza.
const COLONNE_OCCASIONI = Prisma.raw(
  OCCASIONI.map(
    (o) =>
      `, COUNT(*) FILTER (WHERE "annullatoIl" IS NULL AND EXTRACT(MONTH FROM "data") = ${o.mese}` +
      ` AND EXTRACT(DAY FROM "data") BETWEEN ${o.dal} AND ${o.al})::int AS ${colonnaOccasione(o.chiave)}`,
  ).join("\n    "),
);

// La vista dei clienti classificati: aggregato + segmento + tipologia. Tutte le
// query di questo file partono da qui, così i criteri sono scritti una volta
// sola e elenco, catalogo, CSV e API non possono divergere.
function vistaClienti(q?: string, chiave?: string, materializza = false): Prisma.Sql {
  const soloUno = chiave ? Prisma.sql`AND ${CHIAVE} = ${chiave}` : Prisma.empty;
  const come = Prisma.raw(materializza ? "AS MATERIALIZED" : "AS");
  return Prisma.sql`
    WITH base AS (
      SELECT
        ${CHIAVE} AS chiave,
        MAX(COALESCE("clienteNome", "spedizioneNome")) AS nome,
        COALESCE(STRING_AGG(DISTINCT "clienteNome", ' | '), '') AS nomi,
        MAX("clienteEmail") AS email,
        MAX("clienteTelefono") AS telefono,
        MAX("citta") AS citta,
        COUNT(*) FILTER (WHERE "annullatoIl" IS NULL)::int AS ordini,
        COUNT(*) FILTER (WHERE "annullatoIl" IS NOT NULL)::int AS annullati,
        COALESCE(SUM("totale") FILTER (WHERE "annullatoIl" IS NULL), 0)::float8 AS speso,
        MIN("data") FILTER (WHERE "annullatoIl" IS NULL) AS primo,
        MAX("data") FILTER (WHERE "annullatoIl" IS NULL) AS ultimo,
        ARRAY_AGG(DISTINCT "brand") AS brand
        ${COLONNE_OCCASIONI}
      FROM ${tabella("Ordine")}
      WHERE ${IDENTIFICABILE} ${soloUno} ${dove(q)}
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE "annullatoIl" IS NULL) > 0
    ),
    calcolo AS (
      SELECT
        b.*,
        (CURRENT_DATE - b.ultimo::date)::int AS giorni,
        (b.speso / NULLIF(b.ordini, 0))::float8 AS medio,
        COALESCE(ARRAY_LENGTH(b.brand, 1), 0)::int AS n_brand,
        LOWER(SPLIT_PART(COALESCE(b.email, ''), '@', 2)) AS dominio,
        t."tipo" AS tipo_manuale,
        t."note" AS nota_tag
      FROM base b
      LEFT JOIN ${tabella("TagCliente")} t ON t."chiave" = b.chiave
    ),
    -- MATERIALIZED (solo per il catalogo) non è un vezzo: senza, Postgres
    -- ricalcola le espressioni regolari della tipologia per OGNI aggregato che
    -- le legge, e il catalogo ne ha 48 — due per lista. Misurato: 2,0 s → 0,6 s.
    -- Per l'elenco invece conviene il contrario (le calcola solo sulle righe
    -- che mostra): 0,6 s → 0,2 s. Da qui l'interruttore.
    clienti ${come} (
      SELECT
        c.*,
        ${SQL_SEGMENTO} AS segmento,
        ${SQL_TIPOLOGIA_AUTO} AS tipologia_auto,
        COALESCE(c.tipo_manuale, ${SQL_TIPOLOGIA_AUTO}) AS tipologia,
        ${SQL_DOMINIO_AZIENDALE} AS dominio_aziendale
      FROM calcolo c
    )
  `;
}

// Il predicato di una lista del catalogo (nessuna lista = tutti).
function filtroLista(chiaveLista?: string): Prisma.Sql {
  const l = chiaveLista ? lista(chiaveLista) : undefined;
  return l ? Prisma.sql`WHERE ${l.dove}` : Prisma.empty;
}

// Quanti ordini non hanno alcun dato del cliente (mostrato come nota).
export async function ordiniSenzaCliente(): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM ${tabella("Ordine")} WHERE NOT ${IDENTIFICABILE}
  `;
  return Number(r[0]?.n ?? 0);
}

const ORDINAMENTI = {
  speso: Prisma.raw(`speso DESC`),
  ordini: Prisma.raw(`ordini DESC`),
  recenti: Prisma.raw(`ultimo DESC`),
  nome: Prisma.raw(`nome ASC`),
} as const;

export type OrdinamentoClienti = keyof typeof ORDINAMENTI;

export function ordinamentoValido(v: string | undefined): OrdinamentoClienti {
  return v && v in ORDINAMENTI ? (v as OrdinamentoClienti) : "speso";
}

type RigaCliente = {
  chiave: string;
  nome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ordini: number;
  annullati: number;
  speso: number;
  medio: number;
  primo: Date;
  ultimo: Date;
  giorni: number;
  brand: string[];
  segmento: string;
  tipologia: string;
  tipologia_auto: string;
  tipo_manuale: string | null;
  nota_tag: string | null;
  dominio_aziendale: boolean;
};

function daRiga(r: RigaCliente): Cliente {
  return {
    chiave: r.chiave,
    nome: r.nome,
    email: r.email,
    telefono: r.telefono,
    citta: r.citta,
    ordini: r.ordini,
    annullati: r.annullati,
    speso: r.speso ?? 0,
    medio: r.medio ?? 0,
    primoOrdine: r.primo,
    ultimoOrdine: r.ultimo,
    giorni: r.giorni,
    brand: r.brand ?? [],
    segmento: r.segmento,
    tipologia: r.tipologia,
    tipologiaAuto: r.tipologia_auto,
    tipoManuale: r.tipo_manuale,
    notaTag: r.nota_tag,
    dominioAziendale: r.dominio_aziendale,
  };
}

const CAMPI = Prisma.raw(`
  chiave, nome, email, telefono, citta, ordini, annullati, speso, medio,
  primo, ultimo, giorni, brand, segmento, tipologia, tipologia_auto,
  tipo_manuale, nota_tag, dominio_aziendale
`);

// Elenco clienti classificati, paginato. `listaChiave` restringe a una lista
// del catalogo (vedi segmenti.ts).
export async function elencoClienti(
  q: string | undefined,
  ordina: OrdinamentoClienti,
  salta: number,
  quanti: number,
  listaChiave?: string,
): Promise<Cliente[]> {
  const righe = await prisma.$queryRaw<RigaCliente[]>(Prisma.sql`
    ${vistaClienti(q)}
    SELECT ${CAMPI} FROM clienti
    ${filtroLista(listaChiave)}
    ORDER BY ${ORDINAMENTI[ordina]} NULLS LAST, chiave
    LIMIT ${quanti} OFFSET ${salta}
  `);
  return righe.map(daRiga);
}

// Quanti clienti distinti (per la paginazione e il KPI).
export async function contaClienti(q?: string, listaChiave?: string): Promise<number> {
  const r = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    ${vistaClienti(q)}
    SELECT COUNT(*)::int AS n FROM clienti ${filtroLista(listaChiave)}
  `);
  return r[0]?.n ?? 0;
}

// Totali di una selezione: quanti clienti e quanto hanno speso.
export async function totaliClienti(
  q?: string,
  listaChiave?: string,
): Promise<{ clienti: number; speso: number; ordini: number }> {
  const r = await prisma.$queryRaw<{ clienti: number; speso: number; ordini: number }[]>(Prisma.sql`
    ${vistaClienti(q)}
    SELECT
      COUNT(*)::int AS clienti,
      COALESCE(SUM(speso), 0)::float8 AS speso,
      COALESCE(SUM(ordini), 0)::int AS ordini
    FROM clienti ${filtroLista(listaChiave)}
  `);
  return r[0] ?? { clienti: 0, speso: 0, ordini: 0 };
}

// Il catalogo con i numeri: per ogni lista quanti clienti e quanto valgono.
// Una query sola per tutte le liste — sono conteggi condizionati sullo stesso
// aggregato, non ha senso interrogare il database venti volte.
export async function conteggiListe(): Promise<Map<string, { clienti: number; speso: number }>> {
  const pezzi = LISTE.flatMap((l) => [
    Prisma.sql`COUNT(*) FILTER (WHERE ${l.dove})::int AS ${Prisma.raw(colonnaConteggio(l.chiave))}`,
    Prisma.sql`COALESCE(SUM(speso) FILTER (WHERE ${l.dove}), 0)::float8 AS ${Prisma.raw(colonnaSpesa(l.chiave))}`,
  ]);
  const righe = await prisma.$queryRaw<Record<string, number>[]>(Prisma.sql`
    ${vistaClienti(undefined, undefined, true)}
    SELECT ${Prisma.join(pezzi, ", ")} FROM clienti
  `);
  const r = righe[0] ?? {};
  return new Map(
    LISTE.map((l) => [
      l.chiave,
      { clienti: r[colonnaConteggio(l.chiave)] ?? 0, speso: r[colonnaSpesa(l.chiave)] ?? 0 },
    ]),
  );
}

// La scheda di un singolo cliente, con la stessa classificazione dell'elenco.
export async function clienteSingolo(chiave: string): Promise<Cliente | null> {
  const righe = await prisma.$queryRaw<RigaCliente[]>(Prisma.sql`
    ${vistaClienti(undefined, chiave)}
    SELECT ${CAMPI} FROM clienti LIMIT 1
  `);
  return righe[0] ? daRiga(righe[0]) : null;
}

// Il filtro Prisma che seleziona gli ordini di un cliente, data la sua chiave.
// Rispecchia il COALESCE: la chiave è l'email, oppure il telefono, oppure il nome.
export function whereOrdiniCliente(chiave: string): Prisma.OrdineWhereInput {
  return {
    OR: [
      { clienteEmail: { equals: chiave, mode: "insensitive" } },
      { AND: [{ OR: [{ clienteEmail: null }, { clienteEmail: "" }] }, { clienteTelefono: chiave }] },
      {
        AND: [
          { OR: [{ clienteEmail: null }, { clienteEmail: "" }] },
          { OR: [{ clienteTelefono: null }, { clienteTelefono: "" }] },
          { clienteNome: { equals: chiave, mode: "insensitive" } },
        ],
      },
    ],
  };
}

// La chiave viaggia nell'URL: si codifica per sopportare email, spazi e simboli.
export function codificaChiave(chiave: string): string {
  return Buffer.from(chiave, "utf8").toString("base64url");
}

export function decodificaChiave(codice: string): string {
  return Buffer.from(codice, "base64url").toString("utf8");
}
