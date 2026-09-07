// CENSIMENTO DEGLI INDICI — lo stesso per tutte le app Deluxy.
//
// ⚠️⚠️ Perché esiste (07/09/2026). In un solo giorno lo stesso difetto ha fermato
// l'ecosistema due volte: una query che filtra o ordina su una colonna SENZA
// indice legge tutta la tabella, tiene occupata una delle poche connessioni del
// pooler condiviso da 14 app, e le altre app restano senza. Misurato:
//   · piattaforma, `Delivery.updatedAt`  → 39.082 ms  dopo l'indice  2,6 ms
//   · AI Mail, pulizia HTML              →  5.288 ms  dopo l'indice   310 ms
// Nessuna delle due era «lenta per colpa del database»: mancava un indice.
//
// COME SI USA: si COPIA nella cartella dell app (serve il suo node_modules e il
// suo .env), poi si lancia con lo schema di quell app.
//
//   copy "..deluxy-design-systemstrumenticensimento-indici.mts" scripts\n//   npx tsx scripts/censimento-indici.mts <schema>
//
// Gli schemi: messaging (Customer Service) · mail (AI Mail) · orders · platform
// (consegne) · marketing · merchandising · crm · partner · personale · hub …
//
// Non scrive NIENTE: legge le statistiche di Postgres e stampa tre elenchi.
// Gli indici NON si creano in autonomia sul database condiviso (regola Deluxy):
// si porta il risultato al custode delle performance, si concorda, e si crea
// con uno script che misura PRIMA e DOPO.
import { PrismaClient } from '@prisma/client'

const schema = (process.argv[2] ?? '').trim()
if (!schema) {
  console.log('Uso: npx tsx censimento-indici.mts <schema>   (es. messaging, mail, orders, platform, marketing)')
  process.exit(1)
}

const url = process.env.DATABASE_URL
const db = new PrismaClient(
  url ? { datasourceUrl: url.includes('?') ? `${url}&connection_limit=1` : `${url}?connection_limit=1` } : {}
)

console.log(`\n=== CENSIMENTO INDICI · schema "${schema}" ===\n`)

// 1. LE TABELLE CHE VENGONO LETTE PER INTERO
//    seq_scan = quante volte Postgres ha letto la tabella tutta; seq_tup_read =
//    quante righe ha attraversato facendolo. Una tabella grande con tanti
//    seq_scan è il posto dove cercare l'indice mancante.
const tabelle = await db.$queryRawUnsafe<
  { tabella: string; righe: number; letture_intere: number; righe_lette: number; letture_per_indice: number; spazio: string }[]
>(`
  SELECT relname AS tabella,
         n_live_tup AS righe,
         seq_scan AS letture_intere,
         seq_tup_read AS righe_lette,
         COALESCE(idx_scan, 0) AS letture_per_indice,
         pg_size_pretty(pg_total_relation_size(relid)) AS spazio
  FROM pg_stat_user_tables
  WHERE schemaname = $1 AND n_live_tup > 500
  ORDER BY seq_tup_read DESC NULLS LAST
  LIMIT 10`, schema)
console.log('1) Tabelle lette per intero più spesso (le candidate a un indice):')
console.table(tabelle)

// 2. LE QUERY CHE COSTANO DI PIÙ, su questo schema
//    ⚠️ È la misura che conta davvero: dice CHI consuma, non chi era lento
//    nell'istante in cui guardavi. Sotto contesa il cronometro mente.
const dove = await db
  .$queryRawUnsafe<{ schema: string }[]>(`SELECT extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname='pg_stat_statements'`)
  .catch(() => [])
if (!dove.length) {
  console.log('\n2) pg_stat_statements non è attiva: salto la classifica delle query.\n')
} else {
  const q = await db.$queryRawUnsafe<
    { secondi_totali: number; chiamate: number; media_ms: number; query: string }[]
  >(`
    SELECT round(total_exec_time/1000)::int AS secondi_totali,
           calls AS chiamate,
           round(mean_exec_time)::int AS media_ms,
           LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS query
    FROM "${dove[0].schema}".pg_stat_statements
    WHERE query ILIKE '%"' || $1 || '"%'
    ORDER BY total_exec_time DESC
    LIMIT 8`, schema)
  console.log('\n2) Le query più costose di questo schema (dal reset delle statistiche):')
  console.table(q)
}

// 3. GLI INDICI CHE NESSUNO USA
//    Un indice mai usato costa a ogni scrittura e non serve a nessuna lettura:
//    è il difetto opposto, e va tolto con la stessa cautela con cui si crea.
const inutili = await db.$queryRawUnsafe<{ tabella: string; indice: string; usato: number; spazio: string }[]>(`
  SELECT relname AS tabella, indexrelname AS indice, idx_scan AS usato,
         pg_size_pretty(pg_relation_size(indexrelid)) AS spazio
  FROM pg_stat_user_indexes
  WHERE schemaname = $1 AND idx_scan < 50
  ORDER BY pg_relation_size(indexrelid) DESC
  LIMIT 8`, schema)
console.log('\n3) Indici quasi mai usati (costano a ogni scrittura):')
console.table(inutili)

console.log(`
COME SI LEGGE
· Riga 1 con «righe_lette» a milioni e «letture_per_indice» basse = lì manca un indice.
· Riga 2: se una query ha media alta E molte chiamate, è quella che occupa il pooler.
· Prima di creare: EXPLAIN (ANALYZE, BUFFERS) della query vera, a database TRANQUILLO.
  Sotto carico il cronometro mente: si guarda il PIANO (Seq Scan? Sort?), non i millisecondi.
· Poi: proposta al custode (deluxy-design-system/SEGNALAZIONI-PERFORMANCE.md) con la
  misura PRIMA, e creazione con uno script che rimisura DOPO.
`)
await db.$disconnect()
