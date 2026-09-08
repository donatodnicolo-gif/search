import { PrismaClient } from "@prisma/client";

// UNA CONNESSIONE PER ISTANZA (08/09/2026).
//
// Il fatto: in produzione le pagine rispondevano «Qualcosa non ha funzionato», e
// nei log c'era `FATAL: (EMAXCONN) max client connections reached, limit: 200`.
// Non un errore del codice: il pooler del database aveva finito i posti.
//
// L'aritmetica misurata quel giorno: **34 richieste in un secondo** (Next
// precaricava da solo le 22 voci del menu più le decine di link «vai al
// partner» degli elenchi — 72 su una sola pagina di scadenzario), tutte su
// rotte `force-dynamic`, cioè render completi. Con `connection_limit=5` ogni
// istanza serverless può tenere **cinque** connessioni verso il pooler:
// 34 × 5 = 170, più i cron e le altre app → il tetto di 200 salta.
//
// Il precaricamento è stato spento (vedi `Sidebar.tsx`), e QUI si chiude
// l'altra metà: con Supavisor/pgbouncer in transaction mode il numero giusto
// per un ambiente serverless è **1** — è quello che raccomandano sia Prisma sia
// Vercel, perché il pool vero è il pooler, non il processo.
//
// ⚠️ PERCHÉ NELL'URL E NON NELLA VARIABILE D'AMBIENTE. `DATABASE_URL` su Vercel
// è marcata **Sensitive**: non è leggibile (nemmeno da `vercel env pull`, che
// restituisce `[SENSITIVE]`), quindi non si potrebbe modificare senza incollare
// di nuovo a mano l'intera stringa di connessione. Farlo qui la lascia dov'è,
// vale in tutti gli ambienti, e resta scritto nel codice invece che in un
// pannello che nessuno rilegge.
//
// ⚠️ IL VALORE NELL'URL VIENE SOVRASCRITTO, e deve essere così: l'URL di
// produzione porta `connection_limit=5`, che è esattamente il numero da
// cambiare. Rispettare «quello che c'è già» avrebbe lasciato le cose come
// stavano — la correzione sarebbe stata scritta e inefficace.
// La via d'uscita c'è: `PRISMA_CONNECTION_LIMIT` come variabile d'ambiente
// vince su tutto, per alzarlo senza rimettere le mani nel codice (per esempio
// su uno script che gira fuori dal serverless, dove 1 è troppo poco).
function urlConLimite(): string | undefined {
  const grezzo = process.env.DATABASE_URL;
  if (!grezzo) return undefined;
  const limite = process.env.PRISMA_CONNECTION_LIMIT?.trim() || "1";
  try {
    const u = new URL(grezzo);
    u.searchParams.set("connection_limit", limite);
    return u.toString();
  } catch {
    // Una URL che non si riesce a leggere si passa com'è: meglio l'app che
    // parte col vecchio limite di un'app che non parte affatto.
    return grezzo;
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: urlConLimite() });

// Riusiamo la stessa istanza ANCHE in produzione: su Vercel i bundle di pagine e
// route sono separati e, senza questo, ognuno aprirebbe le proprie connessioni al
// pooler pagando l'handshake a ogni invocazione (latenza inutile a ogni pagina).
globalForPrisma.prisma = prisma;
