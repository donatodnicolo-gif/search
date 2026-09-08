import { PrismaClient } from "@prisma/client";

/**
 * ⚠️⚠️ UN TETTO DI CONNESSIONI PER ISTANZA, SUL POOLER (08/09/2026).
 *
 * Il pooler di Supabase (Supavisor, porta 6543) è condiviso da **tutte** le app
 * Deluxy e ha un tetto di **200 connessioni client**. L'08/09 questa app ha
 * risposto `database: false` su `/api/health` e **500 su `/collezioni`**, con
 * l'errore vero nei log di runtime:
 * `PrismaClientInitializationError … FATAL: (EMAXCONN) max client connections
 * reached, limit: 200`.
 *
 * ⚠️ **Non era Postgres a essere pieno**: nello stesso minuto `pg_stat_activity`
 * contava **32 connessioni** (24 idle, 1 attiva). Il tetto che si tocca è quello
 * dei *client del pooler*, che si conta altrove — chi guarda il numero di
 * Postgres conclude che va tutto bene e cerca il guasto dove non c'è.
 *
 * La causa non è una query: è **quante connessioni ogni istanza si tiene**.
 * Senza `connection_limit` Prisma ne apre `num_cpu × 2 + 1` **per istanza**:
 * sulla macchina di sviluppo (8 core) sono **17 posti per un solo `next dev`**,
 * e su Vercel ogni istanza calda ne tiene altrettante, moltiplicate a ogni
 * deploy — il nuovo si scalda mentre il vecchio non si è ancora spento. Ma
 * un'istanza serve una richiesta per volta: più di una manciata non le serve.
 * È la raccomandazione di Prisma dietro pgbouncer/Supavisor, col numero giusto
 * (vedi sotto: tre, non uno).
 *
 * ⚠️ Si tocca **solo** l'indirizzo del pooler (`:6543`): la connessione diretta
 * (`:5432`, `DIRECT_URL`) serve alle migrazioni e vuole il suo pool.
 * ⚠️ E si fa **qui, nel codice**, non nelle variabili d'ambiente: quelle sono
 * segrete, non tornano nemmeno col `vercel env pull`, e una stringa ricopiata a
 * mano è il modo classico di rompere la connessione di un'app intera.
 *
 * Stesso rimedio già applicato a `deluxy-marketing` il 07/09; la proposta di
 * farne una regola per tutte le app è nel registro delle performance.
 */
export function urlPooler(url: string | undefined): string | undefined {
  if (!url || !url.includes(":6543")) return url;
  let u = url;
  // ⚠️⚠️ TRE, non una. Marketing l'ha sbagliato il 07/09: con
  // `connection_limit=1` la home andava in `P2024 Timed out fetching a new
  // connection from the connection pool`, perché quella pagina lancia molte
  // query insieme e con una sola connessione si mettono in fila fino a
  // superare i dieci secondi di attesa. Tre è il compromesso: abbastanza per
  // servire una pagina che conta, molte meno delle diciassette di prima —
  // ed è quest'ultima cosa a salvare il pooler condiviso.
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
