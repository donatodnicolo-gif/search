// SBLOCCA IL DATABASE CONDIVISO: chiude le transazioni ferme.
//
// ⚠️⚠️ A cosa serve (07/09/2026, «tutto il server è giù»). Il pooler di
// Supabase (Supavisor, porta 6543) è condiviso da tutte le app Deluxy. Se
// un'app apre una transazione e non la chiude — succede da solo su Vercel, che
// congela l'istanza appena ha risposto — la connessione resta «idle in
// transaction» e OCCUPA UNO SLOT. Quando gli slot finiscono ogni app risponde
// «Application error»: `ECHECKOUTTIMEOUT`, `EMAXCONN`, o `P2024 Timed out
// fetching a new connection` (che è il pool dell'app, in attesa di una linea
// che non arriva mai).
//
// Uso, dalla cartella deluxy-messaging:
//   npx tsx scripts/sblocca-transazioni.mts            → SOLO GUARDA
//   npx tsx scripts/sblocca-transazioni.mts --chiudi   → chiude quelle ferme
//
// ⚠️ Chiude SOLO le transazioni ferme da più di `--minuti` (2 di default): le
// query ATTIVE non si toccano mai. Una transazione ferma da minuti ha già
// fatto fallire chi l'aveva aperta: chiuderla non perde lavoro utile.
//
// ⚠️⚠️ Client PROPRIO, non quello dell'app: una connessione sola e fino a due
// minuti di attesa. Col client normale (cinque connessioni, dieci secondi)
// questo script falliva proprio quando serviva — «Timed out fetching a new
// connection from the connection pool» — perché il database era intasato.
// E si prova prima la connessione DIRETTA (`DIRECT_URL`, porta 5432): non
// passa dal pooler intasato, che è esattamente quello da sbloccare.
import { PrismaClient } from '@prisma/client'

const chiudi = process.argv.includes('--chiudi')
const minuti = Number((process.argv.find((a) => a.startsWith('--minuti=')) ?? '').split('=')[1] || 2)

function conAttesaLunga(url: string | undefined): string | undefined {
  if (!url) return undefined
  let u = url
  u = /[?&]connection_limit=/.test(u)
    ? u.replace(/([?&]connection_limit=)\d+/, '$11')
    : u + (u.includes('?') ? '&' : '?') + 'connection_limit=1'
  u = /[?&]pool_timeout=/.test(u) ? u.replace(/([?&]pool_timeout=)\d+/, '$1120') : u + '&pool_timeout=120'
  return u
}

/** Prima la diretta, poi il pooler: si tiene la prima che risponde. */
async function collega(): Promise<PrismaClient> {
  const candidati = [
    { nome: 'connessione diretta (DIRECT_URL)', url: conAttesaLunga(process.env.DIRECT_URL) },
    { nome: 'pooler (DATABASE_URL)', url: conAttesaLunga(process.env.DATABASE_URL) },
  ].filter((c) => c.url)
  let ultimo: unknown = null
  for (const c of candidati) {
    const db = new PrismaClient({ datasourceUrl: c.url })
    try {
      await db.$queryRawUnsafe('SELECT 1')
      console.log('collegato con', c.nome)
      return db
    } catch (e) {
      ultimo = e
      console.log('non riesco con', c.nome)
      await db.$disconnect().catch(() => {})
    }
  }
  throw ultimo ?? new Error('nessuna connessione disponibile')
}

const db = await collega()

const ferme = await db.$queryRawUnsafe<
  { pid: number; state: string; min: number; query: string }[]
>(`
  SELECT pid,
         state,
         round(EXTRACT(EPOCH FROM (now() - COALESCE(xact_start, state_change))) / 60)::int AS min,
         LEFT(regexp_replace(COALESCE(query, ''), '\\s+', ' ', 'g'), 70) AS query
  FROM pg_stat_activity
  WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
    AND COALESCE(xact_start, state_change) < now() - (${minuti} || ' minutes')::interval
    AND pid <> pg_backend_pid()
  ORDER BY 3 DESC`)

console.log(`transazioni ferme da più di ${minuti} min: ${ferme.length}`)
console.table(ferme.map((f) => ({ pid: f.pid, stato: f.state, minuti: f.min, query: f.query })))

if (!ferme.length) {
  console.log('Niente da chiudere.')
} else if (!chiudi) {
  console.log('Solo lettura. Per chiuderle: aggiungi --chiudi')
} else {
  let chiuse = 0
  for (const f of ferme) {
    const r = await db
      .$queryRawUnsafe<{ ok: boolean }[]>(`SELECT pg_terminate_backend(${f.pid}) AS ok`)
      .catch(() => [{ ok: false }])
    if (r[0]?.ok) chiuse++
  }
  console.log(`chiuse ${chiuse} su ${ferme.length}`)
}

const dopo = await db.$queryRawUnsafe<{ state: string; n: number }[]>(
  `SELECT COALESCE(state, '—') AS state, count(*)::int AS n FROM pg_stat_activity GROUP BY 1 ORDER BY n DESC`
)
console.table(dopo)
await db.$disconnect()
