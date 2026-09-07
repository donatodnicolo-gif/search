// L'INDICE MANCANTE su platform."Delivery"("updatedAt").
//
// ⚠️⚠️ Misurato il 07/09/2026, con l'ecosistema instabile da metà pomeriggio:
//
//   EXPLAIN ANALYZE SELECT id, code, updatedAt FROM platform."Delivery"
//   WHERE "deletedAt" IS NULL AND "updatedAt" > now() - interval '1 hour'
//   ORDER BY "updatedAt" LIMIT 200
//     → Seq Scan, Rows Removed by Filter: 63.165, **Execution Time 43.529 ms**
//       (43 secondi e mezzo per tornare NOVE righe)
//
// È la query della sincronizzazione app-to-app (`GET /api/v1/app/consegne?
// aggiornateDa=…`, il cursore che il Customer Service usa ogni 15 minuti e che
// oggi è stato chiamato molte volte). Ogni chiamata tiene occupata per 43
// secondi UNA delle ~16 connessioni che il pooler condiviso apre verso
// Postgres: bastano poche chiamate sovrapposte perché tutte e quattordici le
// app Deluxy non trovino più una connessione e rispondano «Application error».
//
// ⚠️ Regola Deluxy: gli indici sul Postgres condiviso NON si creano in
// autonomia. Questo script esiste per essere lanciato dopo il sì dell'utente.
// ⚠️ `CONCURRENTLY` non passa dal pooler in transaction mode: qui si usa la
// forma normale, che blocca la tabella in scrittura per il tempo di creazione
// (su 63.000 righe e 91 MB: pochi secondi).
//
// Uso, dalla cartella deluxy-messaging:
//   npx tsx scripts/indice-delivery-updatedat.mts            → misura e basta
//   npx tsx scripts/indice-delivery-updatedat.mts --crea     → crea l'indice
import { db } from '../src/lib/db'

const crea = process.argv.includes('--crea')

async function misura(quando: string) {
  const p = await db.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT "id","code","updatedAt" FROM "platform"."Delivery"
     WHERE "deletedAt" IS NULL AND "updatedAt" > now() - interval '1 hour'
     ORDER BY "updatedAt" ASC LIMIT 200`
  )
  const testo = p.map((x) => x['QUERY PLAN']).join('\n')
  const tempo = testo.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? '?'
  const modo = /Index (Only )?Scan/.test(testo) ? 'Index Scan' : /Seq Scan/.test(testo) ? 'Seq Scan (legge tutta la tabella)' : '?'
  console.log(`${quando}: ${modo} · ${tempo} ms`)
  return tempo
}

const esistente = await db.$queryRawUnsafe<{ n: number }[]>(
  `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='platform' AND tablename='Delivery' AND indexdef ILIKE '%updatedAt%'`
)
console.log('indici su updatedAt già presenti:', esistente[0].n)

const prima = await misura('PRIMA')

if (!crea) {
  console.log('Solo misura. Per crearlo: aggiungi --crea')
} else if (esistente[0].n > 0) {
  console.log("C'è già: non si crea niente.")
} else {
  console.log('creo l indice…')
  const t0 = Date.now()
  // deletedAt IS NULL nel WHERE: indice parziale, più piccolo e più mirato —
  // le consegne cancellate logicamente non si sincronizzano mai.
  await db.$executeRawUnsafe(
    `CREATE INDEX "Delivery_updatedAt_idx" ON "platform"."Delivery" ("updatedAt") WHERE "deletedAt" IS NULL`
  )
  console.log(`creato in ${Date.now() - t0} ms`)
  await db.$executeRawUnsafe(`ANALYZE "platform"."Delivery"`)
  const dopo = await misura('DOPO')
  console.log(`PRIMA ${prima} ms → DOPO ${dopo} ms`)
}
await db.$disconnect()
