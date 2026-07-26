import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { CHIAVE } from "./clienti";
import { SQL_TIPOLOGIA_AUTO } from "./segmenti";

// La TIPOLOGIA DEL CLIENTE (privato, azienda, hotel, eventi, rivenditore) per le
// API di lettura, così le altre app sanno da che tipo di cliente arriva un ordine
// senza rifarsi i conti in casa.
//
// PERCHÉ SI RISOLVE PER CLIENTE E NON PER ORDINE. La tipologia è una proprietà
// del cliente, non dell'ordine: si deduce dall'insieme dei nomi con cui quella
// persona ha comprato (la colonna `nomi` dell'elenco Clienti), non dal nome
// scritto su un singolo ordine. Chi ha ordinato una volta come "Mario Rossi" e
// una come "Rossi srl" è *azienda* su TUTTI i suoi ordini. Se qui si deducesse
// ordine per ordine, la stessa persona risulterebbe privata in un'app e azienda
// nell'altra — ed è proprio il genere di contraddizione che questo registro
// esiste per evitare.
//
// La regola non è ricopiata: si riusano `CHIAVE` (chi è il cliente) e
// `SQL_TIPOLOGIA_AUTO` (come si deduce il tipo). Come nell'elenco Clienti,
// `TagCliente` — la scelta di un operatore — batte sempre la deduzione.

export type TipologiaInVigore = {
  tipologia: string; // privato | azienda | horeca | eventi | rivenditore
  manuale: boolean; // true = deciso da un operatore, false = dedotto dal nome
};

/**
 * La chiave del cliente calcolata in TypeScript su un singolo ordine.
 *
 * **Deve rispecchiare esattamente `CHIAVE`** (email minuscola → telefono →
 * nome minuscolo, tutti con trim): serve a riagganciare agli ordini le righe che
 * tornano da `tipologiePerChiavi`. Se cambia una, cambia anche l'altra.
 */
export function chiaveCliente(o: {
  clienteEmail?: string | null;
  clienteTelefono?: string | null;
  clienteNome?: string | null;
}): string {
  const email = (o.clienteEmail ?? "").trim().toLowerCase();
  if (email) return email;
  const telefono = (o.clienteTelefono ?? "").trim();
  if (telefono) return telefono;
  return (o.clienteNome ?? "").trim().toLowerCase();
}

/**
 * La tipologia in vigore per un gruppo di clienti, in UNA sola query.
 *
 * Si chiama una volta per pagina di risultati (max 200 ordini), non una volta
 * per ordine: con decine di migliaia di ordini è l'unico modo per non
 * moltiplicare le interrogazioni.
 */
export async function tipologiePerChiavi(chiavi: string[]): Promise<Map<string, TipologiaInVigore>> {
  const unici = [...new Set(chiavi.filter((c) => c))];
  if (!unici.length) return new Map();

  const righe = await prisma.$queryRaw<{ chiave: string; tipologia: string; manuale: boolean }[]>(Prisma.sql`
    WITH base AS (
      SELECT
        ${CHIAVE} AS chiave,
        COALESCE(STRING_AGG(DISTINCT "clienteNome", ' | '), '') AS nomi
      FROM ${tabella("Ordine")}
      WHERE ${CHIAVE} IN (${Prisma.join(unici)})
      GROUP BY 1
    )
    SELECT
      b.chiave,
      COALESCE(t."tipo", ${SQL_TIPOLOGIA_AUTO}) AS tipologia,
      (t."tipo" IS NOT NULL) AS manuale
    FROM base b
    LEFT JOIN ${tabella("TagCliente")} t ON t."chiave" = b.chiave
  `);

  return new Map(righe.map((r) => [r.chiave, { tipologia: r.tipologia, manuale: r.manuale }]));
}

/** Le tipologie degli ordini dati, pronte per `serializzaOrdine`. */
export async function tipologiePerOrdini(
  ordini: { clienteEmail?: string | null; clienteTelefono?: string | null; clienteNome?: string | null }[],
): Promise<Map<string, TipologiaInVigore>> {
  return tipologiePerChiavi(ordini.map(chiaveCliente));
}
