// IL LIMITE ALLE TRANSAZIONI DIMENTICATE, sul database condiviso.
//
// ⚠️⚠️ Perché (07/09/2026, «tutto il server è giù»). Una connessione che apre
// una transazione e non la chiude resta «idle in transaction» e OCCUPA uno
// slot del pooler condiviso da tutte le app Deluxy. Succede da solo su Vercel:
// l'istanza viene congelata appena ha risposto, a volte con la transazione
// ancora aperta. Sul database `idle_in_transaction_session_timeout` era **0**
// — nessun limite — quindi quegli slot non tornavano MAI liberi: a un certo
// punto ogni app rispondeva «Application error» (ECHECKOUTTIMEOUT, EMAXCONN,
// «authentication did not complete»).
//
// Con 60 secondi, una transazione ferma da un minuto viene chiusa dal database
// e lo slot torna disponibile. ⚠️ Conta l'INATTIVITÀ dentro la transazione, non
// la sua durata: una migrazione che lavora non viene toccata.
//
// Uso, dalla cartella deluxy-messaging:
//   npx tsx scripts/timeout-transazioni-ferme.mts             → guarda e basta
//   npx tsx scripts/timeout-transazioni-ferme.mts --applica   → imposta 60s
//
// ⚠️ Vale per le sessioni NUOVE: quelle già appese si chiudono con
// `scripts/sblocca-transazioni.mts --chiudi`.
import { db } from '../src/lib/db'

const applica = process.argv.includes('--applica')
const valore = (process.argv.find((a) => a.startsWith('--valore=')) ?? '').split('=')[1] || '60s'

const prima = await db.$queryRawUnsafe<{ idle_in_transaction_session_timeout: string }[]>(
  `SHOW idle_in_transaction_session_timeout`
)
console.log('adesso (questa sessione):', prima[0]?.idle_in_transaction_session_timeout)

const impostato = await db.$queryRawUnsafe<{ datname: string; setconfig: string[] | null }[]>(
  `SELECT d.datname, s.setconfig
     FROM pg_db_role_setting s
     JOIN pg_database d ON d.oid = s.setdatabase
    WHERE d.datname = current_database()`
)
console.log('impostazioni sul database:', JSON.stringify(impostato))

if (!applica) {
  console.log(`Solo lettura. Per impostare ${valore}: aggiungi --applica`)
} else {
  await db.$executeRawUnsafe(
    `ALTER DATABASE ${'"' + (await db.$queryRawUnsafe<{ d: string }[]>(`SELECT current_database() AS d`))[0].d + '"'} SET idle_in_transaction_session_timeout = '${valore}'`
  )
  const dopo = await db.$queryRawUnsafe<{ datname: string; setconfig: string[] | null }[]>(
    `SELECT d.datname, s.setconfig
       FROM pg_db_role_setting s
       JOIN pg_database d ON d.oid = s.setdatabase
      WHERE d.datname = current_database()`
  )
  console.log('dopo:', JSON.stringify(dopo))
  console.log(`Fatto: le sessioni NUOVE chiudono le transazioni ferme da ${valore}.`)
}
await db.$disconnect()
