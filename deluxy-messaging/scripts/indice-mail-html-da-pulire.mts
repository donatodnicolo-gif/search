// L'INDICE MANCANTE per la pulizia degli HTML di AI Mail.
//
// ⚠️⚠️ Misurato il 07/09/2026 con `pg_stat_statements` (dal 18/08): questa è la
// query **numero uno del cluster** per tempo di CPU consumato —
//
//   SELECT id FROM mail."Messaggio"
//   WHERE "corpoHtml" IS NOT NULL AND uid > $1 AND data < $2 ORDER BY id
//   → 15.284 secondi totali (4 h 15 m), 5.498 chiamate, media 2.780 ms
//
// La tabella ha 44.792 righe ma pesa **774 MB** (i corpi HTML), e non esiste un
// indice che copra quel filtro: si scandisce la chiave primaria leggendo l'heap.
// Misurato oggi a cluster sano: **5.288 ms** anche con LIMIT 200.
//
// Il codice ha già la difesa giusta (`pulisciHtmlVecchio` dorme 24 ore quando
// non trova niente, deluxy-mail/src/lib/htmlServer.ts): il guaio è che ogni
// giorno **qualche messaggio invecchia** oltre la finestra calda, quindi trova
// sempre una manciata di righe — oggi 7 — e non dorme mai. Il cron gira ogni 5
// minuti: 288 scansioni al giorno per pulire una decina di messaggi.
//
// La cura è l'indice PARZIALE: solo 4.373 righe su 44.792 hanno `corpoHtml`,
// quindi l'indice è piccolo e si restringe da solo man mano che la pulizia
// procede.
//
// ⚠️ Regola Deluxy: indici sul Postgres condiviso solo dopo il sì dell'utente.
// ⚠️ `lock_timeout` prima di creare: se la tabella è occupata, meglio fallire
//    subito che mettersi in coda bloccando le scritture di chi arriva dopo.
//
// Uso, dalla cartella deluxy-messaging:
//   npx tsx scripts/indice-mail-html-da-pulire.mts          → misura e basta
//   npx tsx scripts/indice-mail-html-da-pulire.mts --crea   → crea l'indice
import { db } from '../src/lib/db'

const crea = process.argv.includes('--crea')

async function misura(quando: string) {
  const p = await db.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN (ANALYZE, FORMAT TEXT) SELECT "id" FROM "mail"."Messaggio"
     WHERE "corpoHtml" IS NOT NULL AND "uid" > 0 AND "data" < now() - interval '30 days'
     ORDER BY "id" LIMIT 200`
  )
  const t = p.map((x) => x['QUERY PLAN']).join('\n')
  const ms = t.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? '?'
  const modo = /Seq Scan/.test(t) ? 'Seq Scan' : /Index/.test(t) ? 'Index Scan' : '?'
  console.log(`${quando}: ${modo} · ${ms} ms`)
  return ms
}

const gia = await db.$queryRawUnsafe<{ n: number }[]>(
  `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='mail' AND tablename='Messaggio' AND indexname='Messaggio_htmlDaPulire_idx'`
)
const quante = await db.$queryRawUnsafe<{ con_html: number; totali: number }[]>(
  `SELECT count(*) FILTER (WHERE "corpoHtml" IS NOT NULL)::int AS con_html, count(*)::int AS totali FROM "mail"."Messaggio"`
)
console.log(`messaggi con HTML da pulire: ${quante[0].con_html} su ${quante[0].totali} · indice già presente: ${gia[0].n}`)

const prima = await misura('PRIMA')

if (!crea) {
  console.log('Solo misura. Per crearlo: aggiungi --crea')
} else if (gia[0].n > 0) {
  console.log("C'è già: non si crea niente.")
} else {
  await db.$executeRawUnsafe(`SET lock_timeout = '5s'`)
  const t0 = Date.now()
  await db.$executeRawUnsafe(
    `CREATE INDEX "Messaggio_htmlDaPulire_idx" ON "mail"."Messaggio" ("data", "id") WHERE "corpoHtml" IS NOT NULL AND "uid" > 0`
  )
  console.log(`creato in ${Date.now() - t0} ms`)
  const dopo = await misura('DOPO')
  console.log(`PRIMA ${prima} ms → DOPO ${dopo} ms`)
}
await db.$disconnect()
