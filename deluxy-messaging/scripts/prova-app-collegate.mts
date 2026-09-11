// Prova la pagina «App collegate» senza toccare niente: legge lo stato di ogni
// app sorella (dove abita la chiave, se c'è) e — con --prova — chiama davvero
// le app per vedere se rispondono.
//
// ⚠️ Non stampa MAI una chiave: solo se c'è e dove.
//   npx tsx scripts/prova-app-collegate.mts [--prova]
import { db } from '../src/lib/db'
import { provaApp, statoAppCollegate } from '../src/lib/app-collegate'

const conProva = process.argv.includes('--prova')
for (const a of await statoAppCollegate()) {
  console.log(
    `${a.nome.padEnd(24)} ${a.stato.padEnd(13)} chiave: ${a.haChiave ? a.dove.padEnd(9) : 'nessuna  '} ${a.url}`
  )
  if (conProva && a.haChiave) {
    const e = await provaApp(a.chiave)
    console.log(`  → ${e.ok ? 'ok' : 'KO'}: ${e.messaggio}`)
  }
}
await db.$disconnect()
