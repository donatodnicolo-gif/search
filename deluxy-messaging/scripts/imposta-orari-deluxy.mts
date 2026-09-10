// IMPOSTA GLI ORARI PREDEFINITI dei quattro negozi Shopify (10/09/2026, richiesta dell'utente:
// «di default imposta questa cosa per tutti i siti … Fai stessa cosa per sito business.deluxy.it»
// e poi «aggiungi su app anche l'orario di dropoff di default quello previsto ora per ogni brand»).
//
// Per ogni dominio scrive la riga OrarioNegozio col preset del suo brand (REGOLE_PER_DOMINIO in
// orari-regole.ts: deluxy.it e business = REGOLE_DELUXY con drop-off 20:00; Flowers = tre fasce
// ampie con drop-off 16:00; Cake = tre fasce ampie con drop-off 14:00), aperto tutti i giorni,
// nessuna chiusura. ⚠️ Con `--anche-se-scritta` riscrive anche una riga già impostata da un
// amministratore (le sue chiusure e i suoi giorni di apertura vengono TENUTI, cambiano solo le
// regole); senza, la salta.
// Uso: npx tsx scripts/imposta-orari-deluxy.mts [--anche-se-scritta] [--solo dominio]
import fs from 'node:fs'
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')
}
const { db } = await import('../src/lib/db')
const { REGOLE_PER_DOMINIO } = await import('../src/lib/orari-regole')

const forza = process.argv.includes('--anche-se-scritta')
const soloIdx = process.argv.indexOf('--solo')
const solo = soloIdx >= 0 ? process.argv[soloIdx + 1] : ''
for (const [dominio, preset] of Object.entries(REGOLE_PER_DOMINIO)) {
  if (solo && dominio !== solo) continue
  const n = await db.negozioShopify.findFirst({ where: { dominio: { equals: dominio, mode: 'insensitive' } }, select: { id: true, nome: true, orario: true } })
  if (!n) {
    console.log(`SALTO ${dominio}: negozio non trovato`)
    continue
  }
  if (n.orario && !forza) {
    console.log(`SALTO ${n.nome} (${dominio}): ha già orari scritti da ${n.orario.modificatoDa ?? 'qualcuno'} — usa --anche-se-scritta per riscrivere le regole`)
    continue
  }
  const campi = {
    giorniApertura: n.orario?.giorniApertura ?? '0,1,2,3,4,5,6',
    regole: JSON.stringify(preset.regole),
    giorniChiusura: n.orario?.giorniChiusura ?? '[]',
    nota: `Regole di partenza di ${preset.nome} (10/09/2026): drop-off ${preset.regole.oggi.limiteOra}, fasce di ${preset.regole.oggi.durataOre} ore oggi, ${preset.regole.domani.durataOre} domani, ${preset.regole.oltre.durataOre} oltre.`,
    modificatoDa: 'predefinito 10/09/2026',
  }
  await db.orarioNegozio.upsert({ where: { negozioId: n.id }, create: { negozioId: n.id, ...campi }, update: campi })
  console.log(`OK ${n.nome} (${dominio}): regole ${preset.nome}, drop-off ${preset.regole.oggi.limiteOra}`)
}
await db.$disconnect()
process.exit(0)
