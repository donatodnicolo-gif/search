// Travaso dei marchi del glossario: da UNO a una LISTA.
//
// ⚠️⚠️ Va lanciato UNA volta, col codice nuovo appena messo: da qui in poi si
// legge `negoziIds`, e una voce che non è stata travasata risulterebbe «vale
// per tutti i marchi» — cioè una regola di un negozio solo verrebbe detta ai
// clienti di tutti e tre. È l'errore che questo script esiste per impedire.
//
// ⚠️ È RIPETIBILE: tocca solo le voci con la lista vuota E un marchio vecchio.
// Rilanciandolo non disfa un lavoro fatto a mano dopo.
import { db } from '../src/lib/db'

const voci = await db.voceGlossario.findMany({
  select: { id: true, termine: true, negozioId: true, negoziIds: true },
})
console.log(`${voci.length} voci in glossario\n`)

let travasate = 0
let gia = 0
let globali = 0
for (const v of voci) {
  if (v.negoziIds.length) { gia++; continue }
  if (!v.negozioId) { globali++; continue }
  await db.voceGlossario.update({ where: { id: v.id }, data: { negoziIds: [v.negozioId] } })
  travasate++
  console.log(`  travasata «${v.termine}» → [${v.negozioId}]`)
}
console.log(`\n${travasate} travasate · ${gia} avevano già la lista · ${globali} valgono per tutti (lista vuota, giusto così)`)

// ⚠️ Si RILEGGE quello che si è scritto: «l'ho aggiornato» risponde a una
// domanda diversa da «adesso è giusto».
const dopo = await db.voceGlossario.findMany({ select: { termine: true, negozioId: true, negoziIds: true } })
const sbagliate = dopo.filter((v) => v.negozioId && !v.negoziIds.includes(v.negozioId))
console.log(sbagliate.length === 0
  ? '\nControllo: ogni voce che aveva un marchio ce l’ha anche nella lista.'
  : `\n⚠️ ${sbagliate.length} voci NON travasate: ${sbagliate.map((v) => v.termine).join(', ')}`)
await db.$disconnect()
process.exit(sbagliate.length === 0 ? 0 : 1)
