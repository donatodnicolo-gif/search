import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { chiaveDi } from "./clienti";

// DA DOVE CI È ARRIVATO QUESTO CLIENTE — il canale del suo PRIMO ordine valido.
//
// È una domanda diversa da «da dove arriva quest'ordine»: un cliente lo si
// acquista una volta sola. Se poi torna dieci volte scrivendo l'indirizzo, quei
// dieci ordini sono «diretti», ma la persona ce l'ha portata Google Ads — e
// quando si decide dove mettere i soldi, è questa la riga che conta.
//
// Stringa vuota = il primo ordine non ha provenienza (ordine creato a mano,
// oppure troppo vecchio perché Shopify ci associ una visita). Non è «diretto».

export type Acquisizione = { canale: string; data: Date };

export async function acquisizioni(chiavi: string[]): Promise<Map<string, Acquisizione>> {
  const mappa = new Map<string, Acquisizione>();
  if (chiavi.length === 0) return mappa;

  // DISTINCT ON tiene, per ogni cliente, la riga più vecchia: è il modo di
  // Postgres di dire «il primo ordine di ciascuno» in una passata sola.
  const righe = await prisma.$queryRaw<{ chiave: string; canale: string; data: Date }[]>`
    SELECT DISTINCT ON (chiave) chiave, canale, data FROM (
      SELECT ${chiaveDi("o")} AS chiave,
             o."canaleMarketing" AS canale,
             o."data" AS data
        FROM ${tabella("Ordine")} o
       WHERE o."annullatoIl" IS NULL
         AND ${chiaveDi("o")} IN (${Prisma.join(chiavi)})
    ) x
    ORDER BY chiave, data ASC
  `;

  for (const r of righe) mappa.set(r.chiave, { canale: r.canale, data: r.data });
  return mappa;
}
