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
 * ⚠️⚠️ **CORREZIONE DEL 08/09 pomeriggio, dal custode delle prestazioni.** La
 * prima stesura di questo commento diceva che senza `connection_limit` Prisma
 * apre `num_cpu × 2 + 1` per istanza, «17 posti per un solo `next dev`».
 * **Non era una misura, ed era sbagliata**: la `DATABASE_URL` porta già
 * `connection_limit=5` nella query string, e **Prisma legge il parametro
 * dall'URL**, non da questo file. In produzione la variabile è *Sensitive* e
 * non si può leggere, quindi il valore vero **resta ignoto**. Quello che questa
 * funzione fa davvero è **imporre 3** dove l'URL diceva 5, e metterlo dove non
 * c'era.
 *
 * ⚠️ E soprattutto: **la causa vera è quasi certamente un difetto del pooler,
 * non nostro.** Discussione Supabase #40671 e fix `supavisor#783` (Felipe
 * Stival, team pooler): i `ClientHandler` sopravvivono a errori TLS fatali e
 * **non rilasciano mai lo slot**, così i client salgono a 200 nell'arco di
 * giorni mentre i backend di Postgres restano una dozzina — che è esattamente
 * la firma vista qui (32 backend, pooler pieno). Testuale: non è correlato a
 * `max`, `idleTimeoutMillis` né a Fluid Compute.
 *
 * **Quindi cosa resta vero di questo file?** Che un tetto esplicito e basso è
 * prudente e non fa danno, e che l'unica prova causale che abbiamo è
 * osservativa: **spegnendo il `next dev` locale l'app è tornata su in meno di
 * 10 secondi**. Non è la cura del difetto del pooler: è meno benzina sul fuoco
 * finché il fix arriva nella nostra regione. ⚠️ Vercel raccomanda di **non**
 * scendere a 1 (non riduce il totale e fa male alla concorrenza): con Fluid
 * Compute le invocazioni concorrenti condividono l'istanza, e il totale dipende
 * da **quante istanze sono vive**, non da questo numero.
 *
 * ⚠️ Si tocca **solo** l'indirizzo del pooler (`:6543`). ⚠️ Ma attenzione:
 * `DIRECT_URL` **non** è una connessione diretta — punta a
 * `pooler.supabase.com:5432` (session mode) e **consuma dallo stesso budget di
 * 200**. Da sistemare, e non qui: è uguale in tutte le app.
 * ⚠️ E si fa **qui, nel codice**, non nelle variabili d'ambiente: quelle sono
 * segrete, non tornano nemmeno col `vercel env pull`, e una stringa ricopiata a
 * mano è il modo classico di rompere la connessione di un'app intera.
 *
 * Stesso rimedio già applicato a `deluxy-marketing` il 07/09. ⚠️ Il tetto da
 * 200 è **hard-coded per dimensione di compute** (Micro = 60/200): non si alza
 * dalla dashboard, servono compute Small (400) o un Dedicated Pooler. E le 14
 * app **condividono un pool solo**: la chiave di Supavisor è utente+database+
 * modalità, **lo schema non conta**. Il seguito è in mano al custode delle
 * prestazioni, non a questa app.
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
