// Prova di LETTURA (solo lettura): il calendario del partner dei prodotti unici dalla piattaforma
// (GET /api/v1/app/prodotti-unici/calendario) con la chiave del Customer Service.
// Uso: npx tsx scripts/prova-calendario-partner-db.mts [SKU]
import fs from 'node:fs'
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')
}
const { leggiDallaPiattaforma } = await import('../src/lib/piattaforma')
const sku = process.argv[2]
const e = await leggiDallaPiattaforma<{ giorni: number; prodotti: { codice: string; nome: string; partner: string; senzaOrari: boolean; calendario: { data: string; aperto: boolean; dalle: string | null; alle: string | null; origine: string }[] }[] }>(
  `/api/v1/app/prodotti-unici/calendario?giorni=4${sku ? `&codici=${encodeURIComponent(sku)}` : ''}`
)
if (e.stato !== 'ok') { console.log('ESITO', JSON.stringify(e)); process.exit(1) }
console.log('prodotti unici col calendario:', e.dati.prodotti.length)
for (const p of e.dati.prodotti.slice(0, 6)) {
  console.log(` ${p.codice.padEnd(14)} ${p.partner.padEnd(28)} ${p.senzaOrari ? 'SENZA ORARI' : ''} ${p.calendario.map((g) => `${g.data.slice(5)}:${g.aperto ? 'aperto ' + (g.dalle ?? '?') + '-' + (g.alle ?? '?') : 'CHIUSO(' + g.origine + ')'}`).join(' | ')}`)
}
const chiusi = e.dati.prodotti.filter((p) => p.calendario.some((g) => !g.aperto))
console.log('prodotti con almeno un giorno chiuso nei prossimi 4:', chiusi.length, chiusi.slice(0, 3).map((p) => p.codice + '@' + p.partner).join(', '))
process.exit(0)
