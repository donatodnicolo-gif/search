import { Prisma, PrismaClient } from "@prisma/client";

/**
 * TETTO DI CONNESSIONI PER ISTANZA — regola comune a TUTTE le app Deluxy.
 * Deciso l'08/09/2026 dal custode delle prestazioni, dopo che il pooler
 * condiviso si è saturato quattro volte fra il 7 e l'8 settembre.
 *
 * IL FATTO. Le app Deluxy stanno su UN SOLO Postgres Supabase e dietro UN SOLO
 * pooler Supavisor, che ha un tetto di **200 connessioni client**. Quel tetto è
 * hard-coded per dimensione dell'istanza (Micro = 60 connessioni Postgres / 200
 * client): non si alza da dashboard né da API. E lo schema per app non separa
 * niente — la chiave del pool è utente+database+modalità, quindi il pool è uno.
 * Durante i guasti `pg_stat_activity` mostrava 16-33 connessioni su 60: il
 * database stava benissimo, a finire erano i client del pooler.
 *
 * PERCHÉ 3 E NON 1. Vercel lo dice esplicitamente: «non mettere il pool massimo
 * a 1 — non riduce le connessioni totali e danneggia la concorrenza». Con Fluid
 * Compute (attivo di default dal 23/04/2025) più invocazioni concorrenti
 * condividono la stessa istanza e quindi lo STESSO pool: il totale dipende dal
 * numero di istanze vive, non dalle richieste. Marketing con 1 è andata in
 * `P2024 Timed out fetching a new connection` sulla home, che lancia ~22 query
 * insieme; il Customer Service ha rotte con 21 e 19 query parallele. Tre è il
 * numero misurato: due in meno delle cinque che quasi tutte le app avevano
 * nell'URL, ma abbastanza per servire una pagina che conta.
 *
 * COSA NON FA. Non ripara la perdita: abbassare il limite compra respiro sotto
 * un soffitto che perde. La causa più probabile delle saturazioni è un bug lato
 * server di Supavisor (discussione Supabase #40671, fix `supavisor#783`): i
 * `ClientHandler` sopravvivono a errori TLS fatali e non rilasciano mai lo slot.
 *
 * ⚠️ SI TOCCA SOLO L'INDIRIZZO DEL POOLER (`:6543`). La `DIRECT_URL` (`:5432`)
 * serve alle migrazioni e vuole il suo pool: se la si stringe, `prisma db push`
 * e le migrazioni si accodano a se stesse.
 * ⚠️ E SI FA QUI, NON NELLE VARIABILI D'AMBIENTE. Su Vercel `DATABASE_URL` è
 * marcata Sensitive: non è leggibile nemmeno con `vercel env pull`, che
 * restituisce `[SENSITIVE]`. Riscriverla vorrebbe dire incollare a mano una
 * credenziale intera, che è il modo classico di rompere un'app.
 * ⚠️ IL VALORE NELL'URL VIENE SOVRASCRITTO di proposito: l'URL di produzione
 * porta `connection_limit=5`, che è esattamente il numero da cambiare.
 * Via d'uscita: `PRISMA_CONNECTION_LIMIT` vince su tutto, per alzarlo senza
 * rimettere le mani nel codice (per esempio in uno script fuori dal serverless).
 */
export function urlPooler(url: string | undefined): string | undefined {
  if (!url || !url.includes(":6543")) return url;
  const limite = process.env.PRISMA_CONNECTION_LIMIT?.trim() || "3";
  let u = /[?&]connection_limit=/.test(url)
    ? url.replace(
        /([?&]connection_limit=)\d+/,
        (_intero, prefisso: string) => `${prefisso}${limite}`,
      )
    : url + (url.includes("?") ? "&" : "?") + `connection_limit=${limite}`;
  // L'attesa passa da 10 a 20 secondi: quando il pooler è congestionato,
  // aspettare è meglio che rispondere «Application error».
  if (!/[?&]pool_timeout=/.test(u)) u += "&pool_timeout=20";
  return u;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const urlDelPooler = urlPooler(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  (urlDelPooler
    ? new PrismaClient({ datasourceUrl: urlDelPooler })
    : new PrismaClient());

// Riusiamo la stessa istanza ANCHE in produzione: su Vercel i bundle di pagine e
// route sono separati e, senza questo, ognuno aprirebbe le proprie connessioni
// al pooler pagando l'handshake a ogni invocazione.
globalForPrisma.prisma = prisma;

// Lo schema Postgres di questa app (standard Deluxy: un database condiviso, uno
// schema per app — qui `orders`). Prisma lo mette da sé nelle query dei modelli,
// ma NON nelle query grezze: quelle si appoggiano al search_path della
// connessione, e col pooler in modalità transazione capita una connessione che
// non ce l'ha. Sintomo: «relation "Ordine" does not exist» a intermittenza, su
// una query che il minuto prima funzionava. Quindi nelle $queryRaw la tabella
// si qualifica sempre con questo helper.
export const SCHEMA =
  /[?&]schema=([^&]+)/.exec(process.env.DATABASE_URL ?? "")?.[1] ?? "public";

export function tabella(nome: string): Prisma.Sql {
  return Prisma.raw(`"${SCHEMA}"."${nome}"`);
}
