// Prova di LETTURA (sola lettura, niente scritture) degli orari dei negozi dal
// database vero: la relazione `NegozioShopify.orario` e il ripiego al
// predefinito per chi non ha la riga. Uso: npx tsx scripts/prova-orari-negozi-db.mts
import fs from 'node:fs'
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')
}
const { orariDeiNegozi, orarioDelNegozio, orarioConfigurato } = await import('../src/lib/orari-negozi')
const { giornoSelezionabile, primoGiornoAperto } = await import('../src/lib/orari-regole')

const tutti = await orariDeiNegozi()
console.log('negozi:', tutti.length)
for (const n of tutti) {
  console.log(
    ` ${n.negozio.nome.padEnd(10)} configurato=${String(n.configurato).padEnd(5)} giorni=${n.orario.giorniApertura.join(',')} fasce=${n.orario.fasce.length} chiusure=${n.orario.giorniChiusura.length} primoAperto=${primoGiornoAperto(n.orario)}`
  )
}
if (tutti[0]) {
  const uno = await orarioDelNegozio(tutti[0].negozio.id)
  console.log(`orarioDelNegozio(${tutti[0].negozio.nome}) → giorni ${uno.giorniApertura.join(',')}, fasce ${uno.fasce.length}`)
  console.log('domenica 13/09 col punto di partenza:', JSON.stringify(giornoSelezionabile(uno, '2026-09-13')))
  console.log('orarioConfigurato →', (await orarioConfigurato(tutti[0].negozio.id)) === null ? 'null (nessuna regola: le date non si bloccano)' : 'riga trovata')
}
process.exit(0)
