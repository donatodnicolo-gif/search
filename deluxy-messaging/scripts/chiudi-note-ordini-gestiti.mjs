// Le note del diario rimaste APERTE su ordini che sono GIÀ gestiti.
//
// ⚠️ Il codice nuovo (26/08/2026) chiude le note quando si preme «Gestito». Ma
// correggere il codice non corregge quello che il codice vecchio ha già
// lasciato: le note su ordini chiusi PRIMA restano aperte, e nessuno le
// riguarda. Questo script le allinea una volta sola.
//
// ⚠️⚠️ SI CHIUDONO SOLO QUELLE CHE IL CODICE NUOVO AVREBBE CHIUSO, cioè quelle
// **scritte prima** che l'ordine fosse messo gestito. Una nota scritta DOPO non
// è un residuo: è qualcuno che ha voluto lasciare una cosa da fare su un ordine
// già chiuso, e chiuderla vorrebbe dire cancellare una decisione di una persona
// spacciandola per una correzione. (Caso vero: #1741, gestito il 5/08, con una
// nota del 25/08.)
//
// ⚠️ Con `--scrivi` scrive. Senza, dice soltanto cosa farebbe.
// ⚠️ Chiudere una nota NON la cancella: resta nel diario fra le «fatte», e si
// riapre a mano se serviva ancora.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()
const cifre = (n) => (n ?? '').replace(/\D/g, '')
const giorno = (d) => (d ? d.toLocaleDateString('it-IT') : '—')

const aperte = await db.notaDiario.findMany({
  where: { fatta: false, ordineNumero: { not: '' } },
  select: { id: true, ordineNumero: true, testo: true, autoreNome: true, creatoIl: true },
  orderBy: { creatoIl: 'asc' },
})
const numeri = [...new Set(aperte.map((n) => cifre(n.ordineNumero)).filter(Boolean))]
const ordini = await db.ordine.findMany({
  where: { numero: { in: numeri.flatMap((n) => [n, `#${n}`]) }, gestione: 'gestito' },
  select: {
    numero: true,
    negozioNome: true,
    clienteNome: true,
    gestioneDaNome: true,
    gestioneIl: true,
  },
})
const gestiti = new Map(ordini.map((o) => [cifre(o.numero), o]))

const suGestiti = aperte.filter((n) => gestiti.has(cifre(n.ordineNumero)))
const daChiudere = []
const lasciate = []
for (const n of suGestiti) {
  const o = gestiti.get(cifre(n.ordineNumero))
  // ⚠️ Senza la data di chiusura non si indovina: si lascia stare.
  if (o.gestioneIl && n.creatoIl <= o.gestioneIl) daChiudere.push([n, o])
  else lasciate.push([n, o])
}

console.log(
  `note aperte con un ordine: ${aperte.length} · su ordini già gestiti: ${suGestiti.length}` +
    ` · da chiudere: ${daChiudere.length} · lasciate aperte: ${lasciate.length}`
)
const riga = ([n, o]) =>
  `  ${n.ordineNumero} (${o.negozioNome}, ${o.clienteNome}) — «${n.testo.slice(0, 60)}»` +
  ` · nota del ${giorno(n.creatoIl)} di ${n.autoreNome}` +
  ` · ordine gestito il ${giorno(o.gestioneIl)} da ${o.gestioneDaNome || '—'}`

console.log('\n--- SI CHIUDONO (nota scritta prima della chiusura) ---')
for (const c of daChiudere) console.log(riga(c))
console.log('\n--- RESTANO APERTE (nota scritta DOPO: è una scelta, non un residuo) ---')
for (const c of lasciate) console.log(riga(c))

if (scrivi) {
  for (const [n, o] of daChiudere) {
    await db.notaDiario.update({
      where: { id: n.id },
      // ⚠️ Il nome di CHI HA CHIUSO L'ORDINE, non «script»: è quel gesto che
      // avrebbe chiuso la nota se il codice fosse esistito allora.
      data: { fatta: true, fattaIl: new Date(), fattaDaNome: o.gestioneDaNome || '' },
    })
  }
}
console.log(scrivi ? '\nSCRITTO.' : '\nPROVA — rilancia con --scrivi per applicare.')
await db.$disconnect()
