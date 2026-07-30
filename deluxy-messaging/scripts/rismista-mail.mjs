// Smista le mail GIÀ ARRIVATE nel marchio del loro ordine.
//
//   node scripts/rismista-mail.mjs            # dice cosa farebbe
//   node scripts/rismista-mail.mjs --esegui   # scrive
//
// PERCHÉ SERVE: lo smistamento per sito agisce all'ARRIVO della mail, quindi le
// conversazioni più vecchie della modifica restano dove sono. È il motivo per cui
// in Inbox si vedeva ancora «[cakedesign] Ordine #1742 effettuato da Rrenja Tafe»
// nella colonna **Deluxy**: la mail arriva su cs@deluxy.it, e quando è entrata
// l'app non sapeva ancora leggere il numero d'ordine.
//
// COME DECIDE: prende il numero d'ordine dall'oggetto o dal corpo dell'ultimo
// messaggio ricevuto e lo CERCA nella tabella ordini. Se lo trova, il marchio è
// quello dell'ordine — una ricerca, non una deduzione dal testo. Se non lo trova,
// non tocca niente.
//
// ⚠️ La logica ufficiale è in `src/lib/ordine-da-email.ts` e la usa il bottone
// «Applica alle mail già arrivate» in /caselle (che fa anche l'archiviazione dei
// mittenti ignorati). Questo script è la versione da terminale per il giro una
// volta sola: se la regola del numero d'ordine cambia là, va cambiata anche qui.
//
// Non tocca: le conversazioni che hanno già un marchio (potrebbe averlo messo
// una persona), le chat, il cestino. Non cancella niente.

import { readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

for (const file of ['.env', '.env.local']) {
  try {
    for (const riga of readFileSync(file, 'utf8').split('\n')) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}

const esegui = process.argv.includes('--esegui')
const db = new PrismaClient()

/** `#` più 3-7 cifre: il tetto tiene i numeri a cinque cifre di deluxy.it. */
function numeroOrdineDa(testo) {
  const m = (testo ?? '').match(/#(\d{3,7})\b/)
  return m ? `#${m[1]}` : ''
}

const conversazioni = await db.conversazione.findMany({
  where: { canale: 'email', eliminataIl: null, negozioId: null },
  select: { id: true, nome: true, ultimoTesto: true },
  take: 500,
})

let trovate = 0
const cambi = []

for (const c of conversazioni) {
  const ultimo = await db.messaggio.findFirst({
    where: { conversazioneId: c.id, direzione: 'in' },
    orderBy: { creatoIl: 'desc' },
    select: { oggetto: true, testo: true },
  })
  if (!ultimo) continue

  const numero =
    numeroOrdineDa(ultimo.oggetto) ||
    numeroOrdineDa((ultimo.testo ?? '').slice(0, 4000)) ||
    numeroOrdineDa(c.ultimoTesto)
  if (!numero) continue

  const ordine = await db.ordine.findFirst({
    where: { numero },
    select: { negozioId: true, negozioNome: true },
  })
  if (!ordine) continue

  trovate++
  cambi.push({ id: c.id, chi: c.nome || '(senza nome)', numero, marchio: ordine.negozioNome })
  if (esegui) {
    await db.conversazione.update({
      where: { id: c.id },
      data: { negozioId: ordine.negozioId, ordineNumero: numero },
    })
  }
}

console.log(`Conversazioni email senza marchio: ${conversazioni.length}`)
console.log(`Con un numero d'ordine che esiste in tabella: ${trovate}`)
for (const c of cambi.slice(0, 30)) {
  console.log(`  ${c.numero} → ${c.marchio}   (${c.chi})`)
}
if (cambi.length > 30) console.log(`  … e altre ${cambi.length - 30}`)
console.log(esegui ? '\nScritte.' : '\nNiente scritto. Per farlo davvero: --esegui')

await db.$disconnect()
