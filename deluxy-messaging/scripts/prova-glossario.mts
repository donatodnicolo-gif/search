// Il giro del glossario, contro le chat vere.
//   npx tsx scripts/prova-glossario.mts
//
// ⚠️ CHIAMA OpenAI e SCRIVE le proposte in tabella: sono proposte «aperte», che
// una persona accetta o scarta dalla pagina — nessuna voce del glossario viene
// toccata. È esattamente quello che fa il cron delle 5:40.
import { giroGlossario } from '../src/lib/glossario-ai'
import { db } from '../src/lib/db'

const esito = await giroGlossario()
console.log(JSON.stringify(esito, null, 1))

const aperte = await db.propostaGlossario.findMany({
  where: { stato: 'aperta' },
  orderBy: { creatoIl: 'desc' },
  select: { tipo: true, termine: true, definizione: true, perche: true, conversazioneId: true, negozioId: true },
})
console.log(`\nproposte aperte adesso: ${aperte.length}`)
for (const p of aperte) {
  console.log(`\n[${p.tipo}] ${p.termine}${p.negozioId ? ' · marchio ' + p.negozioId.slice(-6) : ' · tutti'}`)
  console.log(`   ${p.definizione}`)
  console.log(`   perché: ${p.perche}`)
  console.log(`   chat:   ${p.conversazioneId}`)
}
await db.$disconnect()
