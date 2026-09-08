// SENTINELLA DEL POOLER — la stessa per tutte le app Deluxy.
//
// ⚠️⚠️ Perché esiste (08/09/2026, chiesta dal custode delle prestazioni).
// Fra il 7 e l'8 settembre l'ecosistema si è fermato quattro volte con
// `FATAL: (EMAXCONN) max client connections reached, limit: 200`, e ogni volta
// il database stava benissimo: `pg_stat_activity` mostrava 11-33 backend su 60.
// A finire erano i CLIENT del pooler Supavisor, non le connessioni a Postgres.
//
// ⚠️ Il punto: quel contatore NON SI LEGGE DA SQL. `pg_stat_activity` vede solo
// i backend, cioè il lato Postgres del pooler. Fra i due numeri non c'è
// nessuna relazione — ed è proprio quella discrepanza la firma del difetto di
// Supavisor (discussione Supabase #40671, fix `supavisor#783`: i `ClientHandler`
// sopravvivono a errori TLS fatali e non rilasciano mai lo slot).
//
// Quindi l'unico allarme praticabile è INDIRETTO: si apre una connessione
// NUOVA e si cronometra la stretta di mano. Quando gli slot stanno finendo, ad
// accorgersene per primo è chi arriva adesso.
//
// COME SI LEGGE IL RISULTATO
//
//   pooler lento + pochi backend  → sono finiti gli SLOT CLIENT del pooler.
//                                   È il bug: si riavvia il pooler dalla
//                                   dashboard Supabase (Settings → Database).
//   pooler lento + molti backend  → è Postgres sotto carico: si cerca la query
//                                   (censimento-indici.mts) o la transazione
//                                   ferma, NON si riavvia niente.
//   pooler lento + diretto lento  → è la rete o il progetto intero.
//
// COME SI USA: si COPIA nella cartella dell'app (serve il suo node_modules e il
// suo .env), poi si lancia. Non scrive niente e non tocca dati.
//
//   1. copia questo file dentro `scripts/` della tua app
//   2. npx tsx scripts/sentinella-pooler.mts            (un giro solo)
//   3. npx tsx scripts/sentinella-pooler.mts --ogni 60  (ogni 60 secondi)
//
// ⚠️ NON si lascia girare dentro un'app serverless e NON si mette in un cron
// di Vercel: aprire una connessione nuova ogni minuto da dentro il sistema che
// stai misurando aggiunge al problema. Si lancia da una macchina fuori — un
// portatile, un piccolo servizio a parte — proprio perché deve dire la verità
// anche quando l'ecosistema è a terra.
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const iOgni = args.indexOf('--ogni')
const ogniSecondi = iOgni >= 0 ? Math.max(15, Number(args[iOgni + 1] ?? 60) || 60) : 0

/** Sopra questa soglia la stretta di mano è un allarme. Misurata a sistema sano. */
const SOGLIA_MS = 1500
/** Sopra questa è già un guasto in corso. */
const SOGLIA_ROSSA_MS = 4000

function conParametro(url: string, chiave: string, valore: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return new RegExp(`[?&]${chiave}=`).test(url)
    ? url.replace(new RegExp(`([?&]${chiave}=)[^&]*`), `$1${valore}`)
    : `${url}${sep}${chiave}=${valore}`
}

/**
 * Cronometra una connessione NUOVA: `$connect()` più una domanda banale.
 *
 * ⚠️⚠️ Il client si crea qui dentro e si butta subito: riusarne uno misurerebbe
 * una connessione GIÀ APERTA, cioè esattamente la cosa che non ci interessa.
 * Chi è già dentro non si accorge che la porta è chiusa.
 * ⚠️ `connection_limit=1`: la sonda deve costare uno slot, non cinque.
 */
async function stretta(url: string): Promise<{ ms: number; errore: string }> {
  const db = new PrismaClient({ datasourceUrl: conParametro(url, 'connection_limit', '1') })
  const inizio = Date.now()
  try {
    await db.$connect()
    await db.$queryRaw`SELECT 1`
    return { ms: Date.now() - inizio, errore: '' }
  } catch (e) {
    return { ms: Date.now() - inizio, errore: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  } finally {
    // ⚠️ Sempre, anche dopo un errore: una sonda che si tiene lo slot è
    // il problema travestito da misura.
    await db.$disconnect().catch(() => {})
  }
}

/** Quanti backend ha Postgres, e quanti ne può avere. Si chiede col pooler. */
async function backend(url: string) {
  const db = new PrismaClient({ datasourceUrl: conParametro(url, 'connection_limit', '1') })
  try {
    const [r] = await db.$queryRaw<{ vivi: bigint; attivi: bigint; tetto: string }[]>`
      SELECT count(*)::bigint AS vivi,
             count(*) FILTER (WHERE state = 'active')::bigint AS attivi,
             current_setting('max_connections') AS tetto
      FROM pg_stat_activity WHERE datname = current_database()`
    const [f] = await db.$queryRaw<{ ferme: bigint }[]>`
      SELECT count(*)::bigint AS ferme FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle in transaction'
        AND state_change < now() - interval '60 seconds'`
    return { vivi: Number(r.vivi), attivi: Number(r.attivi), tetto: Number(r.tetto), ferme: Number(f.ferme) }
  } catch {
    return null
  } finally {
    await db.$disconnect().catch(() => {})
  }
}

async function giro() {
  const pooler = process.env.DATABASE_URL ?? ''
  const diretto = process.env.DIRECT_URL ?? ''
  if (!pooler) {
    console.error('Manca DATABASE_URL: la sonda va lanciata dentro la cartella di un\'app.')
    process.exit(1)
  }
  if (!pooler.includes(':6543')) {
    console.log('⚠️  DATABASE_URL non passa dal pooler (:6543): questa sonda misura il pooler.')
  }

  const quando = new Date().toLocaleTimeString('it-IT')
  const p = await stretta(pooler)
  // ⚠️ Il diretto è il CONTROLLO: senza, «lento» non distingue il pooler pieno
  // da un database sotto carico, e si finisce per riavviare la cosa sbagliata.
  const d = diretto ? await stretta(diretto) : null
  const b = await backend(pooler)

  const stato = p.errore
    ? '🔴 NON RISPONDE'
    : p.ms >= SOGLIA_ROSSA_MS
      ? '🔴 GUASTO'
      : p.ms >= SOGLIA_MS
        ? '🟠 ALLARME'
        : '🟢 sano'

  const pezzi = [`${quando}  ${stato}  pooler ${p.ms} ms`]
  if (p.errore) pezzi.push(`(${p.errore})`)
  if (d) pezzi.push(d.errore ? `· diretto non raggiungibile (${d.errore})` : `· diretto ${d.ms} ms`)
  if (b) pezzi.push(`· backend ${b.vivi}/${b.tetto} (${b.attivi} attivi${b.ferme ? `, ${b.ferme} ferme in transazione` : ''})`)
  console.log(pezzi.join(' '))

  // Il verdetto, scritto per esteso solo quando c'è qualcosa da dire: una riga
  // di allarme che nessuno sa come leggere non è un allarme.
  if ((p.errore || p.ms >= SOGLIA_MS) && b) {
    const pochiBackend = b.vivi < b.tetto * 0.5
    const direttoSano = d && !d.errore && d.ms < SOGLIA_MS
    if (pochiBackend && direttoSano) {
      console.log(
        '   → SLOT CLIENT DEL POOLER ESAURITI. Il database è libero ' +
          `(${b.vivi} backend su ${b.tetto}) e in diretta risponde in ${d!.ms} ms: ` +
          'è il difetto Supavisor #40671. Si riavvia il pooler dalla dashboard Supabase.'
      )
    } else if (!pochiBackend) {
      console.log(
        `   → POSTGRES SOTTO CARICO (${b.vivi} backend su ${b.tetto}` +
          `${b.ferme ? `, ${b.ferme} transazioni ferme da oltre un minuto` : ''}). ` +
          'NON riavviare il pooler: cerca la query (censimento-indici.mts) o sblocca le transazioni.'
      )
    } else {
      console.log('   → Lento anche in diretta, o diretto non raggiungibile: è la rete o il progetto intero.')
    }
  }
}

if (ogniSecondi) {
  console.log(`Sentinella del pooler · un controllo ogni ${ogniSecondi} s · Ctrl+C per fermarla`)
  console.log(`Soglie: 🟠 oltre ${SOGLIA_MS} ms · 🔴 oltre ${SOGLIA_ROSSA_MS} ms\n`)
  await giro()
  setInterval(() => void giro().catch((e) => console.error('giro fallito:', e)), ogniSecondi * 1000)
} else {
  await giro()
  process.exit(0)
}
