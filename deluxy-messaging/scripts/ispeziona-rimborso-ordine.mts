// Sola LETTURA: di un ordine dice se il rimborso è DAVVERO uscito oppure è
// solo registrato. Nasce dal caso #2846 (11/09/2026): `refundCreate` era andato
// a buon fine, l'app diceva «Rimborsato», ma la transazione REFUND su Shopify
// Payments era rimasta PENDING per ore — `totalRefunded` a 0,00 e l'ordine
// ancora «Pagato», quindi ancora fra quelli da lavorare. Sembrava tornato
// indietro da solo.
//
// Registrare un rimborso e incassarlo sono due momenti: il primo è nostro, il
// secondo è del gateway. Questo script guarda il secondo.
//
//   npx tsx scripts/ispeziona-rimborso-ordine.mts 2846
import { db } from '../src/lib/db'
import { graphqlNegozio, negozioConToken } from '../src/lib/shopify-negozio'

const numero = (process.argv[2] || '').replace('#', '').trim()
if (!numero) {
  console.log('serve il numero dell’ordine:  npx tsx scripts/ispeziona-rimborso-ordine.mts 2846')
  process.exit(1)
}

const ordine = await db.ordine.findFirst({
  where: { numero: { contains: numero } },
  select: {
    id: true,
    numero: true,
    negozioId: true,
    negozioNome: true,
    shopifyId: true,
    totale: true,
    valuta: true,
    statoPagamento: true,
    gestione: true,
    gestioneDaNome: true,
  },
})
if (!ordine) {
  console.log('ordine non trovato nella nostra copia')
  process.exit(1)
}
console.log('NOSTRA COPIA')
console.log('  numero           ', ordine.numero, '·', ordine.negozioNome)
console.log('  totale           ', ordine.totale, ordine.valuta)
console.log('  statoPagamento   ', ordine.statoPagamento, '(arriva da Orders, può essere vecchio)')
console.log('  gestione         ', ordine.gestione, ordine.gestioneDaNome ? `(${ordine.gestioneDaNome})` : '')

const accesso = await negozioConToken(ordine.negozioId)
if (!accesso) {
  console.log('niente token per questo negozio')
  process.exit(1)
}

const Q = `query O($id: ID!) {
  order(id: $id) {
    name displayFinancialStatus updatedAt
    totalPriceSet { presentmentMoney { amount currencyCode } shopMoney { amount currencyCode } }
    totalRefundedSet { presentmentMoney { amount currencyCode } shopMoney { amount currencyCode } }
    netPaymentSet { presentmentMoney { amount currencyCode } }
    refunds(first: 20) {
      id createdAt note
      totalRefundedSet { presentmentMoney { amount currencyCode } }
      transactions(first: 20) {
        nodes { id kind status errorCode amountSet { presentmentMoney { amount currencyCode } } }
      }
    }
  }
}`

type Soldi = { amount?: string; currencyCode?: string } | null
type Tx = { id: string; kind: string; status: string; errorCode?: string | null; amountSet?: { presentmentMoney?: Soldi } | null }
type Reso = {
  id: string
  createdAt: string
  note?: string | null
  totalRefundedSet?: { presentmentMoney?: Soldi } | null
  transactions?: { nodes?: Tx[] } | null
}
type Ordine = {
  name: string
  displayFinancialStatus: string
  updatedAt: string
  totalPriceSet?: { presentmentMoney?: Soldi } | null
  totalRefundedSet?: { presentmentMoney?: Soldi } | null
  netPaymentSet?: { presentmentMoney?: Soldi } | null
  refunds?: Reso[]
}

const r = await graphqlNegozio<{ errors?: { message: string }[]; data?: { order?: Ordine | null } }>(
  accesso.negozio,
  accesso.token,
  Q,
  { id: ordine.shopifyId }
)
if (r.errors?.length || !r.data?.order) {
  console.log('Shopify:', JSON.stringify(r.errors ?? 'ordine non trovato', null, 2))
  process.exit(1)
}
const o = r.data.order
const s = (v: Soldi) => `${v?.amount ?? '?'} ${v?.currencyCode ?? ''}`.trim()

console.log('')
console.log('SHOPIFY')
console.log('  stato            ', o.displayFinancialStatus, '· aggiornato', o.updatedAt)
console.log('  pagato dal cliente', s(o.totalPriceSet?.presentmentMoney ?? null))
console.log('  già reso          ', s(o.totalRefundedSet?.presentmentMoney ?? null))
console.log('  ancora incassato  ', s(o.netPaymentSet?.presentmentMoney ?? null))

const resi = o.refunds ?? []
console.log('')
console.log(`RIMBORSI REGISTRATI: ${resi.length}`)
let sospesi = 0
for (const x of resi) {
  console.log(`  ${x.id}  ${x.createdAt}  reso: ${s(x.totalRefundedSet?.presentmentMoney ?? null)}`)
  if (x.note) console.log(`    nota: ${x.note}`)
  const tx = (x.transactions?.nodes ?? []).filter((t) => t.kind === 'REFUND')
  if (!tx.length) console.log('    ⚠️ nessuna transazione: è un rimborso solo CONTABILE, i soldi non escono')
  for (const t of tx) {
    const q = s(t.amountSet?.presentmentMoney ?? null)
    console.log(`    ${t.status.padEnd(7)} ${q}${t.errorCode ? ` · errore ${t.errorCode}` : ''}`)
  }
  if (tx.length && !tx.some((t) => t.status === 'SUCCESS')) sospesi++
}

console.log('')
if (sospesi) {
  console.log(
    `⚠️ ${sospesi} rimborso/i REGISTRATO ma non chiuso dal gateway: i soldi non sono ancora usciti,`
  )
  console.log('   l’ordine resta «Pagato» su Shopify e quindi resta fra quelli da lavorare.')
  console.log('   Non si rifà: si aspetta che la transazione passi a SUCCESS (o guardare i payout).')
} else if (resi.length) {
  console.log('✅ Rimborsi chiusi dal gateway: i soldi sono usciti.')
  console.log('   Se da noi l’ordine risulta ancora pagato è la sincronizzazione a essere in ritardo:')
  console.log('   al giro dopo la regola in `sincronizza.ts` lo chiude da sola (solo se reso per intero).')
} else {
  console.log('Nessun rimborso su questo ordine.')
}
await db.$disconnect()
