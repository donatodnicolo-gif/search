// Accende la risposta di primo contatto e scrive il testo di partenza.
// Scrive DUE righe della tabella Impostazione, niente altro.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const TESTO =
  'Ciao! Grazie per averci scritto: abbiamo ricevuto il tuo messaggio e ti rispondiamo ' +
  'appena possibile. Se riguarda un ordine, scrivici il numero (per esempio #1234): ' +
  'ci aiuta a risponderti più in fretta.'

for (const [chiave, valore] of [['primoContattoAttivo', 'si'], ['primoContattoTesto', TESTO]]) {
  await db.impostazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } })
}
const righe = await db.impostazione.findMany({ where: { chiave: { startsWith: 'primoContatto' } } })
console.log(righe.map((r) => `${r.chiave} = ${r.valore}`).join('\n'))
await db.$disconnect()
