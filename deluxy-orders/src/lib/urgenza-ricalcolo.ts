import { Prisma } from "@prisma/client";
import { prisma, tabella } from "./db";
import { SQL_URGENZA } from "./urgenza";

// Riscrive l'urgenza di TUTTO l'archivio in una query sola: sono due date che
// abbiamo già, non serve chiedere niente a nessuno.
//
// Si aggiornano solo gli ordini in cui il valore cambia davvero: riscrivere
// righe identiche su un database condiviso è lavoro sprecato, e sporca la
// colonna `updatedAt` di migliaia di ordini che non sono cambiati.
export async function ricalcolaUrgenza(): Promise<{ aggiornati: number }> {
  const aggiornati = await prisma.$executeRaw`
    UPDATE ${tabella("Ordine")} AS o
       SET "urgenza" = ${Prisma.raw(`(${SQL_URGENZA})`)}
     WHERE o."urgenza" IS DISTINCT FROM ${Prisma.raw(`(${SQL_URGENZA})`)}
  `;
  return { aggiornati };
}
