// Le vendite già gestite con un PAGAMENTO IN APP ma senza consegna nella
// piattaforma: la consegna si crea di là (Artista Locale, già in storico) o,
// se c'è già, si aggancia. La stessa regola gira nella sync ogni 15 minuti;
// questo script serve a lanciarla subito o a guardare cosa farebbe.
//
//   npx tsx --env-file=.env scripts/consegne-da-pagamenti-in-app.mts            → simula
//   npx tsx --env-file=.env scripts/consegne-da-pagamenti-in-app.mts --applica  → scrive
//   … #2868 #2871   per limitare a certi ordini
import { db } from '../src/lib/db'
import { consegnePerPagamentiInApp } from '../src/lib/consegne-da-pagamenti'

const applica = process.argv.includes('--applica')
const soloNumeri = process.argv.filter((a) => a.startsWith('#'))
const e = await consegnePerPagamentiInApp({ prova: !applica, soloNumeri })
console.log(applica ? 'APPLICATO' : 'SIMULATO (niente scritto)')
if (e.errore) console.log('⚠️', e.errore)
for (const r of e.righe) console.log(`${r.numero} · ${r.esito} · ${r.testo}`)
console.log(`create ${e.create} · agganciate ${e.agganciate} · righe ${e.righe.length}`)
await db.$disconnect()
