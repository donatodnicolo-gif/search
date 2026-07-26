import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { chiaveDi } from "./clienti";

// È UN REPEATER O È LA PRIMA VOLTA?
//
// La domanda vale più di quanto sembri: al primo ordine si sta conquistando una
// persona, al quarto la si sta servendo. Cambia il tono del messaggio, cambia
// quanto si può sbagliare, cambia quanto vale quell'ordine davvero.
//
// Non si guarda «quanti ordini ha quel cliente oggi», ma **quanti ne aveva
// prima di questo**: così un ordine di due anni fa resta «primo ordine» anche
// se nel frattempo la persona ne ha fatti altri dieci. La storia non si
// riscrive all'indietro.
//
// Il cliente è lo stesso della pagina Clienti (email → telefono → nome, la
// regola sta in `clienti.ts`): un ordine fatto con la stessa email su Flowers e
// uno su deluxy.it sono la stessa persona, e il secondo è un ritorno.
//
// Gli ordini annullati non contano come «volta precedente»: un ordine annullato
// non è un cliente servito. L'ordine annullato in sé conserva comunque il suo
// posto in fila.

export type Ordinale = {
  precedenti: number; // ordini validi dello stesso cliente PRIMA di questo
  numero: number; // 1 = primo ordine, 2 = secondo…
  repeater: boolean;
};

// Per gli ordini indicati, quanti ordini validi li precedono. Una query sola:
// scorre gli ordini una volta e li unisce alla pagina che si sta guardando —
// contare cliente per cliente vorrebbe dire cinquanta query per una schermata.
//
// Chi non è nella mappa è un ordine **senza cliente riconoscibile** (niente
// email, telefono né nome): lì non si sa se sia un ritorno, e non lo si tira a
// indovinare.
export async function ordinali(ids: string[]): Promise<Map<string, Ordinale>> {
  const mappa = new Map<string, Ordinale>();
  if (ids.length === 0) return mappa;

  const righe = await prisma.$queryRaw<{ id: string; precedenti: bigint }[]>`
    WITH scelti AS (
      SELECT o."id", o."data", ${chiaveDi("o")} AS chiave
      FROM ${tabella("Ordine")} o
      WHERE o."id" IN (${Prisma.join(ids)})
    )
    SELECT s."id", COUNT(p."id") AS precedenti
    FROM scelti s
    LEFT JOIN ${tabella("Ordine")} p
      ON ${chiaveDi("p")} = s.chiave
     AND p."data" < s."data"
     AND p."annullatoIl" IS NULL
    WHERE s.chiave IS NOT NULL
    GROUP BY s."id"
  `;

  for (const r of righe) {
    const precedenti = Number(r.precedenti);
    mappa.set(r.id, { precedenti, numero: precedenti + 1, repeater: precedenti > 0 });
  }
  return mappa;
}

// Come si legge in una riga: «1º ordine» oppure «Repeater · 4º».
export function etichettaOrdinale(o: Ordinale | undefined): string | null {
  if (!o) return null;
  return o.repeater ? `Repeater · ${o.numero}º` : "1º ordine";
}
