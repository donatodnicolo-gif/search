import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// I clienti non sono una tabella a sé: si ricavano dagli ordini. Un cliente è
// identificato dalla sua email (minuscola); se manca, dal telefono; se manca
// anche quello, dal nome. Così un cliente che ha ordinato dieci volte su brand
// diversi resta una persona sola.
//
// L'aggregazione si fa in SQL (COALESCE + GROUP BY): con decine di migliaia di
// ordini è l'unico modo per restare veloci.

export type Cliente = {
  chiave: string;
  nome: string | null;
  email: string | null;
  telefono: string | null;
  citta: string | null;
  ordini: number;
  speso: number;
  primoOrdine: Date;
  ultimoOrdine: Date;
  brand: string[];
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
  if (!q) return Prisma.sql`WHERE ${IDENTIFICABILE}`;
  const like = `%${q}%`;
  return Prisma.sql`WHERE ${IDENTIFICABILE} AND (
    "clienteNome" ILIKE ${like} OR
    "clienteEmail" ILIKE ${like} OR
    "clienteTelefono" ILIKE ${like} OR
    "spedizioneNome" ILIKE ${like} OR
    "citta" ILIKE ${like}
  )`;
}

// Quanti ordini non hanno alcun dato del cliente (mostrato come nota).
export async function ordiniSenzaCliente(): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "Ordine" WHERE NOT ${IDENTIFICABILE}
  `;
  return Number(r[0]?.n ?? 0);
}

const ORDINAMENTI = {
  speso: Prisma.sql`SUM("totale") DESC`,
  ordini: Prisma.sql`COUNT(*) DESC`,
  recenti: Prisma.sql`MAX("data") DESC`,
  nome: Prisma.sql`MIN("clienteNome") ASC`,
} as const;

export type OrdinamentoClienti = keyof typeof ORDINAMENTI;

export function ordinamentoValido(v: string | undefined): OrdinamentoClienti {
  return v && v in ORDINAMENTI ? (v as OrdinamentoClienti) : "speso";
}

// Elenco clienti con i totali, paginato.
export async function elencoClienti(
  q: string | undefined,
  ordina: OrdinamentoClienti,
  salta: number,
  quanti: number,
): Promise<Cliente[]> {
  const righe = await prisma.$queryRaw<
    {
      chiave: string;
      nome: string | null;
      email: string | null;
      telefono: string | null;
      citta: string | null;
      ordini: bigint;
      speso: number | null;
      primo: Date;
      ultimo: Date;
      brand: string[];
    }[]
  >`
    SELECT
      ${CHIAVE} AS chiave,
      MAX(COALESCE("clienteNome", "spedizioneNome")) AS nome,
      MAX("clienteEmail") AS email,
      MAX("clienteTelefono") AS telefono,
      MAX("citta") AS citta,
      COUNT(*) AS ordini,
      SUM("totale") AS speso,
      MIN("data") AS primo,
      MAX("data") AS ultimo,
      ARRAY_AGG(DISTINCT "brand") AS brand
    FROM "Ordine"
    ${dove(q)}
    GROUP BY ${CHIAVE}
    ORDER BY ${ORDINAMENTI[ordina]}
    LIMIT ${quanti} OFFSET ${salta}
  `;

  return righe.map((r) => ({
    chiave: r.chiave,
    nome: r.nome,
    email: r.email,
    telefono: r.telefono,
    citta: r.citta,
    ordini: Number(r.ordini),
    speso: r.speso ?? 0,
    primoOrdine: r.primo,
    ultimoOrdine: r.ultimo,
    brand: r.brand ?? [],
  }));
}

// Quanti clienti distinti (per la paginazione e il KPI).
export async function contaClienti(q?: string): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (
      SELECT ${CHIAVE} AS chiave FROM "Ordine" ${dove(q)} GROUP BY ${CHIAVE}
    ) AS c
  `;
  return Number(r[0]?.n ?? 0);
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
