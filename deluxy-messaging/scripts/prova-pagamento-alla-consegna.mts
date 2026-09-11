// «PAGA ALLA CONSEGNA», provato dal vivo e poi ripulito.
//
// ⚠️⚠️ Utente, 11/09/2026: «metti come possibilità di scelta del pagamento …
// esempio pagamento alla consegna». Qui si prova la cosa vera: si crea un
// ordine col contrassegno dalla STESSA funzione che usa il modulo, si controlla
// che Shopify lo faccia nascere DA INCASSARE (e non pagato), e lo si annulla.
//
// ⚠️ Crea un ordine VERO su un negozio VERO. Il cliente si chiama «Test», che
// per la regola di casa lo rende un ordine di prova (escluso dalle altre app), e
// alla fine viene annullato. Non esiste un modo di provarlo senza crearlo: è
// proprio la nascita dell'ordine che si sta verificando.
//   npx tsx scripts/prova-pagamento-alla-consegna.mts
import { creaOrdine } from '../src/lib/nuovo-ordine'
import { db } from '../src/lib/db'
import { graphqlNegozio, negozioConToken } from '../src/lib/shopify-negozio'

let falliti = 0
const v = (n: string, ok: boolean, d = '') => { if (!ok) falliti++; console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`) }

const n = await db.negozioShopify.findFirst({ where: { nome: { contains: 'Deluxy' } }, select: { id: true, nome: true } })
if (!n) { console.log('nessun negozio'); process.exit(1) }
console.log(`negozio di prova: ${n.nome}\n`)

const base = {
  negozioId: n.id,
  cliente: { nome: 'Test', cognome: 'Contrassegno', email: '', telefono: '+39 333 123 4567', note: '' },
  destinatario: null,
  consegna: { data: '', fascia: '', indirizzo: 'Via Prova 1', cap: '20121', citta: 'Milano', provincia: 'MI', paese: 'IT', civicoNote: '' },
  righe: [{ titolo: 'Prova contrassegno', prezzo: 10, quantita: 1 }],
  biglietto: '',
  spedizione: { titolo: 'Consegna', prezzo: 0 },
  aggiungiIva: false,
  mezzoPagamento: 'Contanti alla consegna',
} as const

console.log('── L ordine nasce DA INCASSARE ──')
const esito = await creaOrdine({ ...base, pagamento: 'alla-consegna' } as never)
if (!esito.ok) {
  v('creato', false, esito.errore)
} else {
  v('creato senza link di pagamento', !esito.linkPagamento, esito.ordineNumero)
  v('ha un numero d ordine vero (non è restato bozza)', !!esito.ordineNumero, esito.ordineNumero)

  const a = await negozioConToken(n.id)
  const letto = await graphqlNegozio<{ data?: { orders?: { edges?: { node: Record<string, unknown> }[] } } }>(
    a!.negozio, a!.token,
    `{ orders(first: 1, sortKey: CREATED_AT, reverse: true) { edges { node {
        id name displayFinancialStatus
        totalOutstandingSet { shopMoney { amount currencyCode } }
        paymentTerms { paymentTermsName paymentTermsType }
        note
        customAttributes { key value }
      } } } }`
  )
  const o = letto.data?.orders?.edges?.[0]?.node as Record<string, any> | undefined
  if (!o || o.name !== esito.ordineNumero) {
    v('riletto da Shopify', false, `l ultimo ordine è ${o?.name}, non ${esito.ordineNumero}`)
  } else {
    v('Shopify lo dà DA INCASSARE (PENDING)', o.displayFinancialStatus === 'PENDING', String(o.displayFinancialStatus))
    v('e dice quanto c è da incassare', Number(o.totalOutstandingSet?.shopMoney?.amount) > 0, `${o.totalOutstandingSet?.shopMoney?.amount} ${o.totalOutstandingSet?.shopMoney?.currencyCode}`)
    v('coi termini «alla consegna»', o.paymentTerms?.paymentTermsType === 'FULFILLMENT', o.paymentTerms?.paymentTermsName ?? '—')
    v('la nota lo dice a chi consegna', String(o.note ?? '').includes('DA INCASSARE ALLA CONSEGNA'), String(o.note ?? '').split('\n').find((r: string) => r.includes('INCASSARE')) ?? '—')
    const attr = (o.customAttributes ?? []).find((x: any) => x.key === 'Pagamento_Alla_Consegna')
    v('e l attributo lo dice alle macchine', !!attr, attr ? `${attr.key} = ${attr.value}` : '—')

    // ── pulizia: era una prova ──
    const ann = await graphqlNegozio<any>(a!.negozio, a!.token,
      `mutation A($orderId: ID!) { orderCancel(orderId: $orderId, reason: OTHER, refund: false, restock: true, staffNote: "Prova tecnica del pagamento alla consegna") { orderCancelUserErrors { message } userErrors { message } } }`,
      { orderId: o.id })
    const err = ann.data?.orderCancel?.orderCancelUserErrors?.[0]?.message ?? ann.data?.orderCancel?.userErrors?.[0]?.message
    v('ordine di prova annullato', !err, err ?? o.name)
    // e la riga che il CS si era scritto
    await db.ordineCreato.deleteMany({ where: { ordineNumero: o.name } })
  }
}

console.log(falliti ? `\n${falliti} controlli falliti` : '\nTutto a posto.')
await db.$disconnect()
