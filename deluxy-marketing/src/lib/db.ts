import { PrismaClient } from "@prisma/client";

/**
 * ⚠️⚠️ UNA CONNESSIONE PER ISTANZA, SUL POOLER (07/09/2026).
 *
 * Il pooler di Supabase (Supavisor, porta 6543) è condiviso da TUTTE le app
 * Deluxy e ha un tetto di **200 connessioni client**. Il 07/09 si è saturato
 * due volte e ogni pagina che legge il database rispondeva «Application
 * error»: prima `FATAL: (EMAXCONN) max client connections reached` (Customer
 * Service, mattina), poi `FATAL: Failed to connect to database: authentication
 * did not complete within 15000ms` (questa app, 17:31 e 17:37 — digest
 * 3126821648, segnalato dall'utente).
 *
 * La causa non è il codice: è quante connessioni ogni istanza si tiene. Senza
 * `connection_limit` Prisma ne apre `cpu × 2 + 1` **per istanza**, e su
 * serverless le istanze sono decine: il tetto si raggiunge da solo. Ma
 * un'istanza serve UNA richiesta per volta, quindi più di una connessione non
 * le serve: è la raccomandazione di Prisma dietro pgbouncer/Supavisor.
 *
 * ⚠️ Si tocca SOLO l'indirizzo del pooler (`:6543`): la connessione diretta
 * (`:5432`, `DIRECT_URL`) serve alle migrazioni e vuole il suo pool.
 * ⚠️ E si fa QUI, non nelle variabili d'ambiente: quelle sono segrete, non si
 * leggono nemmeno col `vercel env pull`, e una stringa ricopiata a mano è il
 * modo classico di rompere la connessione di un'app intera.
 */
export function urlPooler(url: string | undefined): string | undefined {
  if (!url || !url.includes(":6543")) return url;
  if (/[?&]connection_limit=/.test(url)) {
    return url.replace(/([?&]connection_limit=)\d+/, "$11");
  }
  return url + (url.includes("?") ? "&" : "?") + "connection_limit=1";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = urlPooler(process.env.DATABASE_URL);

function crea(): PrismaClient {
  return url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? crea();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
