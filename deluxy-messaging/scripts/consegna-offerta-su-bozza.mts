// Mette la riga «Consegna offerta» a 0 € su una bozza Shopify già creata.
//
// Serve per le bozze create PRIMA del 06/09/2026 con la spunta «senza costo di
// consegna»: allora la bozza nasceva senza riga di spedizione, e il checkout di
// Shopify calcolava da sé la tariffa (bozza #D5685, segnalata dall'utente).
// Con la riga a zero il checkout la rispetta. Il link della fattura resta lo
// stesso: il cliente rientra e trova il totale giusto.
//
//   npx tsx scripts/consegna-offerta-su-bozza.mts <negozioId> <gid://shopify/DraftOrder/…>
//
// Solo lettura senza --applica: mostra com'è la bozza. Con --applica la aggiorna.
import { db } from '../src/lib/db'
import { decifra } from '../src/lib/crypto'

const [negozioId, bozzaId] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const applica = process.argv.includes('--applica')
if (!negozioId || !bozzaId) {
  console.log('Uso: npx tsx scripts/consegna-offerta-su-bozza.mts <negozioId> <gid bozza> [--applica]')
  process.exit(1)
}
const n = await db.negozioShopify.findUnique({ where: { id: negozioId } })
if (!n) throw new Error('Negozio non trovato: ' + negozioId)

const tok = (await (
  await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: n.clientId, client_secret: decifra(n.clientSecret), grant_type: 'client_credentials' }),
  })
).json()) as { access_token?: string }
if (!tok.access_token) throw new Error('Token Shopify non ottenuto')

async function gql<T>(query: string, variables?: unknown): Promise<T> {
  const r = await fetch(`https://${n!.dominio}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tok.access_token! },
    body: JSON.stringify({ query, variables }),
  })
  return (await r.json()) as T
}

type Bozza = {
  name: string
  status: string
  invoiceUrl: string
  totalPriceSet: { shopMoney: { amount: string } }
  shippingLine: { title: string; originalPriceSet: { shopMoney: { amount: string } } } | null
}
const prima = await gql<{ data?: { draftOrder?: Bozza | null }; errors?: unknown }>(
  `query($id: ID!) { draftOrder(id: $id) { name status invoiceUrl totalPriceSet { shopMoney { amount } } shippingLine { title originalPriceSet { shopMoney { amount } } } } }`,
  { id: bozzaId }
)
const b = prima.data?.draftOrder
if (!b) throw new Error('Bozza non trovata: ' + JSON.stringify(prima).slice(0, 300))
console.log(`${b.name} · ${b.status} · totale ${b.totalPriceSet.shopMoney.amount} · spedizione: ${b.shippingLine ? `${b.shippingLine.title} ${b.shippingLine.originalPriceSet.shopMoney.amount}` : 'NESSUNA RIGA (il checkout la calcola da sé)'}`)
if (b.status === 'COMPLETED') {
  console.log('La bozza è già diventata un ordine: non si tocca.')
} else if (!applica) {
  console.log('Simulazione: aggiungi --applica per mettere la riga «Consegna offerta» a 0 €.')
} else {
  const r = await gql<{ data?: { draftOrderUpdate?: { draftOrder?: Bozza; userErrors?: { field?: string[]; message: string }[] } }; errors?: unknown }>(
    `mutation($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { name status invoiceUrl totalPriceSet { shopMoney { amount } } shippingLine { title originalPriceSet { shopMoney { amount } } } } userErrors { field message } } }`,
    { id: bozzaId, input: { shippingLine: { title: 'Consegna offerta', price: '0' } } }
  )
  const err = r.data?.draftOrderUpdate?.userErrors ?? []
  if (err.length || r.errors) {
    console.log('NON aggiornata:', JSON.stringify(err.length ? err : r.errors))
  } else {
    const d = r.data!.draftOrderUpdate!.draftOrder!
    console.log(`Aggiornata: ${d.name} · totale ${d.totalPriceSet.shopMoney.amount} · spedizione ${d.shippingLine?.title} ${d.shippingLine?.originalPriceSet.shopMoney.amount} · stesso link ${d.invoiceUrl}`)
  }
}
await db.$disconnect()
