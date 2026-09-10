// IMPOSTA GLI ORARI PREDEFINITI di deluxy.it e business.deluxy.it (10/09/2026,
// richiesta dell'utente: «di default imposta questa cosa per tutti i siti:
// deluxy.it consegna nello stesso giorno in fasce di 2 ore a partire dal secondo
// paio d'ore successivo a quello in corso, dalle 20 l'ordine è possibile per il
// giorno dopo con fascia di 2 ore, per i giorni successivi fascia di un'ora …
// Fai stessa cosa per sito business.deluxy.it»).
//
// Scrive (o riscrive) la riga OrarioNegozio dei due negozi con REGOLE_DELUXY,
// aperti tutti i giorni, nessuna chiusura. ⚠️ Con `--anche-se-scritta` riscrive
// anche una riga già impostata da un amministratore; senza, la salta.
// Uso: npx tsx scripts/imposta-orari-deluxy.mts [--anche-se-scritta]
import fs from 'node:fs'
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')
}
const { db } = await import('../src/lib/db')
const { REGOLE_DELUXY } = await import('../src/lib/orari-regole')

const DOMINI = ['deluxygifts.myshopify.com', '90bfeb-f5.myshopify.com']
const forza = process.argv.includes('--anche-se-scritta')
for (const dominio of DOMINI) {
  const n = await db.negozioShopify.findFirst({ where: { dominio: { equals: dominio, mode: 'insensitive' } }, select: { id: true, nome: true, orario: { select: { id: true, modificatoDa: true } } } })
  if (!n) {
    console.log(`SALTO ${dominio}: negozio non trovato`)
    continue
  }
  if (n.orario && !forza) {
    console.log(`SALTO ${n.nome} (${dominio}): ha già orari scritti da ${n.orario.modificatoDa ?? 'qualcuno'} — usa --anche-se-scritta per riscriverli`)
    continue
  }
  const campi = {
    giorniApertura: '0,1,2,3,4,5,6',
    regole: JSON.stringify(REGOLE_DELUXY),
    giorniChiusura: '[]',
    nota: 'Regole dettate il 10/09/2026: oggi 2 ore dalla seconda fascia dopo quella in corso, limite 20:00; domani 2 ore; oltre 1 ora dalla disponibilità minima dei prodotti.',
    modificatoDa: 'predefinito 10/09/2026',
  }
  await db.orarioNegozio.upsert({ where: { negozioId: n.id }, create: { negozioId: n.id, ...campi }, update: campi })
  console.log(`OK ${n.nome} (${dominio}): regole deluxy.it scritte`)
}
await db.$disconnect()
process.exit(0)
