// Prova del rimborso SENZA rimborsare: `preparaRimborso` fa tutti i controlli
// e dice su quali incassi renderebbe, ma non chiama la mutazione.
//   npx tsx provarimborso.mts
import { preparaRimborso } from '../src/lib/rimborso-shopify'
import { db } from '../src/lib/db'

let falliti = 0
const v = (n: string, ok: boolean, d = '') => { if (!ok) falliti++; console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`) }

const ordini = await db.ordine.findMany({
  where: { statoPagamento: 'PAID', shopifyId: { startsWith: 'gid://' } },
  orderBy: { data: 'desc' },
  take: 3,
  select: { id: true, numero: true, totale: true, negozioNome: true },
})

console.log('── Un rimborso piccolo su ordini pagati veri ──')
for (const o of ordini) {
  const p = await preparaRimborso({ ordineId: o.id, importo: 1 })
  if (!('transazioni' in p)) { v(`${o.numero} (${o.negozioNome})`, false, `${p.stato}: ${p.messaggio}`); continue }
  const somma = p.transazioni.reduce((s, t) => s + Number(t.amount), 0)
  v(
    `${o.numero} (${o.negozioNome}) tot ${o.totale}`,
    p.transazioni.length > 0 && Math.round(somma * 100) === 100,
    `resta ${p.restante} ${p.valuta} · renderebbe ${somma} su ${p.transazioni.map((t) => `${t.gateway} ${t.parentId.split('/').pop()}`).join(', ')}`
  )
}

console.log('\n── I paletti ──')
const o0 = ordini[0]
const troppo = await preparaRimborso({ ordineId: o0.id, importo: o0.totale * 100 })
v('piu di quanto si puo rendere → fermato', troppo.stato === 'troppo', 'stato: ' + troppo.stato)
const zero = await preparaRimborso({ ordineId: o0.id, importo: 0 })
v('importo zero → fermato', zero.stato === 'errore', 'stato: ' + zero.stato)
const inesistente = await preparaRimborso({ ordineId: 'non-esiste', importo: 1 })
v('ordine che non e qui → fermato', inesistente.stato === 'senza-ordine', 'stato: ' + inesistente.stato)

const estero = await db.ordine.findFirst({
  where: { statoPagamento: 'PAID', shopifyId: { startsWith: 'gid://' }, paese: { not: 'IT' } },
  orderBy: { data: 'desc' },
  select: { id: true, numero: true, paese: true },
})
if (estero) {
  const e = await preparaRimborso({ ordineId: estero.id, importo: 1 })
  console.log(`  ordine estero ${estero.numero} (${estero.paese}): ${e.stato}${'messaggio' in e ? ' — ' + e.messaggio : ''}`)
}

console.log(falliti ? `\n${falliti} controlli falliti` : '\nTutto a posto (e non e uscito un euro).')
await db.$disconnect()
