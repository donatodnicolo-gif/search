// Chiude le richieste di rimborso che su Shopify risultano GIÀ RESE.
//
// ⚠️⚠️ Di suo NON scrive: senza `--esegui` dice solo che cosa chiuderebbe.
// Qui si chiudono d'ufficio delle pratiche di denaro: si guarda prima.
//   npx tsx scripts/chiudi-rimborsi-gia-resi.mts            (prova a secco)
//   npx tsx scripts/chiudi-rimborsi-gia-resi.mts --esegui   (chiude davvero)
import { chiudiRimborsiGiaResi } from '../src/lib/rimborsi-gia-resi'
import { db } from '../src/lib/db'

const esegui = process.argv.includes('--esegui')
console.log(esegui ? '── CHIUSURA VERA ──' : '── prova a secco: non scrive niente ──')
const e = await chiudiRimborsiGiaResi({ prova: !esegui })
console.log(`\nletti ${e.letti} · ${esegui ? 'chiusi' : 'da chiudere'} ${e.chiusi} · parziali ${e.parziali} · senza ordine Shopify ${e.senzaOrdine} · errori ${e.errori}`)
for (const r of e.righe) console.log('  ' + r)
if (!esegui && e.chiusi) console.log('\nPer chiuderli davvero: npx tsx scripts/chiudi-rimborsi-gia-resi.mts --esegui')
await db.$disconnect()
