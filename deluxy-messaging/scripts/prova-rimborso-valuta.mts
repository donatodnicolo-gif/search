// Prova del rimborso su un ordine in VALUTA STRANIERA, senza rimborsare.
//
// ⚠️⚠️ Nasce dall'ordine #2846: pagato 160,00 $ dal cliente, 138,20 € per il
// negozio. Fino all'11/09/2026 un ordine così si fermava con «va fatto da
// Shopify». Adesso parte, ma il numero mandato a Shopify dev'essere quello del
// CLIENTE: se un giorno tornasse in euro, il cliente riceverebbe 138,20 $.
// Questo script lo controlla su ordini veri e non fa uscire un euro.
//   npx tsx scripts/prova-rimborso-valuta.mts
import { preparaRimborso } from '../src/lib/rimborso-shopify'
import { db } from '../src/lib/db'

let falliti = 0
const v = (n: string, ok: boolean, d = '') => {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`)
}
const somma = (t: { amount: string }[]) => t.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0)

console.log('── L ordine estero che ha fatto nascere tutto (#2846) ──')
const o2846 = await db.ordine.findFirst({
  where: { numero: { contains: '2846' } },
  select: { id: true, numero: true, totale: true, valuta: true },
})
if (!o2846) {
  console.log('  (#2846 non è più nel registro: si salta)')
} else {
  const tutto = await preparaRimborso({ ordineId: o2846.id, importo: o2846.totale })
  if (!('transazioni' in tutto)) {
    v('rimborso totale', false, `${tutto.stato}: ${tutto.messaggio}`)
  } else {
    v('non si ferma più sulla valuta', true, `${tutto.valuta} → ${tutto.valutaCliente}`)
    v('la conversione è dichiarata', tutto.conversione === true)
    v('il cliente riceve 160,00 USD', Math.round(tutto.importoCliente * 100) === 16000, `${tutto.importoCliente} ${tutto.valutaCliente}`)
    v('le transazioni sommano il numero del CLIENTE', somma(tutto.transazioni) === Math.round(tutto.importoCliente * 100), `${somma(tutto.transazioni) / 100}`)
    v('NON somma i nostri euro', somma(tutto.transazioni) !== Math.round(o2846.totale * 100))
    v('si aggancia a un incasso vero', tutto.transazioni.every((t) => t.parentId.includes('OrderTransaction') && !!t.gateway))

    // Una parte: 69,10 € sono metà dell ordine, quindi 80,00 $.
    const meta = await preparaRimborso({ ordineId: o2846.id, importo: Math.round(o2846.totale * 50) / 100 })
    if (!('transazioni' in meta)) {
      v('rimborso parziale', false, `${meta.stato}: ${meta.messaggio}`)
    } else {
      v('metà ordine → metà nella valuta del cliente', Math.round(meta.importoCliente * 100) === 8000, `${meta.importoCliente} ${meta.valutaCliente}`)
      v('e le transazioni la seguono', somma(meta.transazioni) === Math.round(meta.importoCliente * 100))
    }

    const troppo = await preparaRimborso({ ordineId: o2846.id, importo: o2846.totale + 1 })
    v('più del residuo → fermato', troppo.stato === 'troppo', 'stato: ' + troppo.stato)
  }
}

console.log('\n── Gli ordini in euro non devono cambiare di una virgola ──')
const italiani = await db.ordine.findMany({
  where: { statoPagamento: 'PAID', shopifyId: { startsWith: 'gid://' }, valuta: 'EUR' },
  orderBy: { data: 'desc' },
  take: 3,
  select: { id: true, numero: true, negozioNome: true },
})
for (const o of italiani) {
  const p = await preparaRimborso({ ordineId: o.id, importo: 1 })
  if (!('transazioni' in p)) {
    console.log(`  ..  ${o.numero} (${o.negozioNome}): ${p.stato} — ${p.messaggio}`)
    continue
  }
  v(
    `${o.numero} (${o.negozioNome}) rende 1,00 senza conversioni`,
    somma(p.transazioni) === 100 && Math.round(p.importoCliente * 100) === 100,
    `${p.valuta}${p.conversione ? ` → ${p.valutaCliente} (conversione!)` : ''}`
  )
}

console.log(falliti ? `\n${falliti} controlli falliti` : '\nTutto a posto (e non è uscito un euro).')
await db.$disconnect()
