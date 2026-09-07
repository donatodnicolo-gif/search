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
 * le serve: è la raccomandazione di Prisma dietro pgbouncer/Supavisor (col numero giusto: vedi
 * sotto, tre e non una).
 *
 * ⚠️ Si tocca SOLO l'indirizzo del pooler (`:6543`): la connessione diretta
 * (`:5432`, `DIRECT_URL`) serve alle migrazioni e vuole il suo pool.
 * ⚠️ E si fa QUI, non nelle variabili d'ambiente: quelle sono segrete, non si
 * leggono nemmeno col `vercel env pull`, e una stringa ricopiata a mano è il
 * modo classico di rompere la connessione di un'app intera.
 */
export function urlPooler(url: string | undefined): string | undefined {
  if (!url || !url.includes(":6543")) return url;
  let u = url;
  // ⚠️⚠️ TRE, non una (corretto il 07/09/2026 dopo averlo sbagliato). Con
  // `connection_limit=1` la home è andata in `P2024 Timed out fetching a new
  // connection from the connection pool`: quella pagina lancia molte query
  // insieme (i conteggi della bacheca) e con una sola connessione si mettono
  // in fila fino a superare i 10 secondi di attesa. Tre è il compromesso: due
  // in meno delle cinque di prima per ogni istanza — che è ciò che salva il
  // pooler condiviso — ma abbastanza per servire una pagina che conta.
  u = /[?&]connection_limit=/.test(u)
    ? u.replace(/([?&]connection_limit=)\d+/, "$13")
    : u + (u.includes("?") ? "&" : "?") + "connection_limit=3";
  // E l'attesa passa da 10 a 20 secondi: quando il pooler è congestionato,
  // aspettare è meglio che rispondere «Application error».
  if (!/[?&]pool_timeout=/.test(u)) u += "&pool_timeout=20";
  return u;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = urlPooler(process.env.DATABASE_URL);

function crea(): PrismaClient {
  return url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? crea();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
