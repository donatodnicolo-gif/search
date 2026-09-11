// Sola LETTURA: dice, di un ordine, che cosa ha pagato il cliente (valuta di
// presentazione) e che cosa vede il negozio (valuta del negozio), incasso per
// incasso. Serve a decidere un rimborso su un ordine in valuta straniera.
//   npx tsx scripts/ispeziona-valuta-ordine.mts 2846
import { db } from '../src/lib/db'
import { graphqlNegozio, negozioConToken } from '../src/lib/shopify-negozio'

const numero = (process.argv[2] || '').replace('#', '').trim()
const ordine = await db.ordine.findFirst({
  where: { numero: { contains: numero } },
  select: { id: true, numero: true, totale: true, valuta: true, negozioId: true, negozioNome: true, shopifyId: true },
})
if (!ordine) { console.log('ordine non trovato'); process.exit(1) }
console.log('nostro registro:', JSON.stringify(ordine, null, 2))

const accesso = await negozioConToken(ordine.negozioId)
if (!accesso) { console.log('niente token'); process.exit(1) }

const Q = `query O($id: ID!) {
  order(id: $id) {
    id name currencyCode presentmentCurrencyCode
    totalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
    netPaymentSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
    transactions(first: 30) {
      id kind status gateway processedAt
      parentTransaction { id }
      amountSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
    }
  }
}`
const r = await graphqlNegozio<{ errors?: { message: string }[]; data?: { order?: unknown } }>(
  accesso.negozio, accesso.token, Q, { id: ordine.shopifyId }
)
console.log(JSON.stringify(r.errors ?? r.data, null, 2))
await db.$disconnect()
