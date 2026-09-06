// Le vendite già gestite con un PAGAMENTO IN APP (richiesta di pagamento al
// fornitore fatta dal Customer Service) ma SENZA consegna nella piattaforma:
// la consegna si crea di là e si porta in storico («consegnata»).
//
// Regola dell'utente (06/09/2026): «le vendite che abbiamo già gestito con
// pagamento in app: crea la consegna anche in app delivery e porta sempre
// nella stessa app la vendita in storico». Partner: SEMPRE «Artista Locale»
// (il fornitore vero, pagato dall'app, va nelle note); consegna «da
// fornitore» (default del canale app per Artista Locale); servizio «Vendita
// Deluxy»; prodotto padre (SKU dell'ordine) o la prima della famiglia o il
// generico, con prezzo flessibile pari al pagamento.
//
//   npx tsx --env-file=.env scripts/consegne-da-pagamenti-in-app.mts            → simula
//   npx tsx --env-file=.env scripts/consegne-da-pagamenti-in-app.mts --applica  → scrive
//   … [#2868 #2871]  per limitare a certi ordini
import { db } from '../src/lib/db'
import { prefillInApp, mandaInApp } from '../src/lib/manda-in-app'
import { partnerPiattaforma, serviziPiattaforma, prodottiPiattaforma } from '../src/lib/piattaforma'
import { righeOrdineDaOrders } from '../src/lib/orders'

const applica = process.argv.includes('--applica')
const soloNumeri = process.argv.filter((a) => a.startsWith('#'))

// ── Chi ha un pagamento in app e non ha una consegna di là ──
const richieste = await db.richiestaPagamento.findMany({
  where: { OR: [{ NOT: { ordineNumero: '' } }, { NOT: { ordineId: '' } }], importo: { gt: 0 } },
  select: { ordineNumero: true, ordineId: true, intestatario: true, importo: true, pagataIl: true, creatoIl: true },
})
const numeri = [...new Set(richieste.map((r) => '#' + r.ordineNumero.replace(/^#/, '')).filter((n) => n !== '#'))]
const ordini = await db.ordine.findMany({
  where: {
    OR: [{ numero: { in: numeri } }, { id: { in: richieste.map((r) => r.ordineId).filter(Boolean) } }],
    annullatoIl: null,
    appConsegnaId: '',
  },
  select: { id: true, numero: true, shopifyId: true, negozioNome: true, clienteNome: true, citta: true, dataConsegna: true, gestione: true, fornitoreNome: true },
})
const ddt = ordini.map((o) => o.numero.replace(/^#/, ''))
const inApp = await db.$queryRawUnsafe<{ ddtNumber: string }[]>(
  `SELECT "ddtNumber" FROM platform."Delivery" WHERE "deletedAt" IS NULL AND "ddtNumber" = ANY($1::text[])`,
  ddt
)
const giaInApp = new Set(inApp.map((x) => x.ddtNumber))
let daFare = ordini.filter((o) => !giaInApp.has(o.numero.replace(/^#/, '')))
if (soloNumeri.length) daFare = daFare.filter((o) => soloNumeri.includes(o.numero))
daFare.sort((a, b) => (a.dataConsegna?.getTime() ?? 0) - (b.dataConsegna?.getTime() ?? 0))
console.log(`${applica ? 'APPLICO' : 'SIMULO'} · ordini con pagamento in app e senza consegna in piattaforma: ${daFare.length}`)

// ── Partner «Artista Locale» e servizio «Vendita Deluxy» ──
const partner = await partnerPiattaforma()
if (partner.stato !== 'ok') throw new Error('partner: ' + JSON.stringify(partner))
const artista = partner.dati.find((p) => p.insegna.trim().toLowerCase() === 'artista locale')
if (!artista) throw new Error('«Artista Locale» non è fra i partner della piattaforma')
const servizi = await serviziPiattaforma()
if (servizi.stato !== 'ok') throw new Error('servizi: ' + JSON.stringify(servizi))
const vendita = servizi.dati.find((s) => /vendita\s*deluxy/i.test(s.nome || s.name || ''))
if (!vendita) throw new Error('«Vendita Deluxy» non è fra i servizi')
if (artista.servizi && !artista.servizi.includes(vendita.id)) {
  console.log('⚠️ «Vendita Deluxy» NON è nel listino di Artista Locale: la piattaforma rifiuterebbe. Mi fermo.')
  process.exit(1)
}
console.log(`partner: ${artista.insegna} (${artista.id}) · servizio: ${vendita.nome ?? vendita.name} (${vendita.id})`)

let fatte = 0
for (const o of daFare) {
  const mie = richieste.filter((r) => r.ordineId === o.id || '#' + r.ordineNumero.replace(/^#/, '') === o.numero)
  const pagata = mie.find((r) => r.pagataIl) ?? mie[0]
  const pre = await prefillInApp(o.id)
  if (!pre) { console.log(`${o.numero}: prefill vuoto, salto`); continue }
  // Il prodotto: padre (SKU esatto) → prima della famiglia → generico.
  const righe = await righeOrdineDaOrders(o.numero, o.shopifyId)
  const riga = righe.stato === 'ok' ? righe.righe[0] : undefined
  const sku = (riga?.sku ?? '').trim().toUpperCase()
  let prodotto: { id: string; sku: string; nome: string } | null = null
  let comeScelto = ''
  const cat = await prodottiPiattaforma(sku || riga?.titolo || '', '')
  if (cat.stato === 'ok') {
    const lista = cat.dati.prodotti
    const perSku = (x: { sku: string }) => (x.sku ?? '').toUpperCase()
    const padre = sku ? lista.find((x) => perSku(x) === sku) : undefined
    const famiglia = sku ? lista.filter((x) => perSku(x).startsWith(sku)) : []
    if (padre) { prodotto = padre; comeScelto = 'padre' }
    else if (famiglia.length) { prodotto = famiglia[0]; comeScelto = `prima della famiglia (${famiglia.length}, padre assente)` }
    else if (cat.dati.generico) { prodotto = cat.dati.generico; comeScelto = 'generico' }
  }
  if (!prodotto) { console.log(`${o.numero}: nessun prodotto utilizzabile (sku «${sku}»), salto`); continue }
  const quando = pagata?.pagataIl ? pagata.pagataIl.toLocaleDateString('it-IT') : pagata?.creatoIl.toLocaleDateString('it-IT')
  const notaFornitore = `Fornitore pagato dall'app: ${pagata?.intestatario ?? o.fornitoreNome} — ${pagata?.importo.toFixed(2)} € (${pagata?.pagataIl ? 'pagamento' : 'richiesta'} del ${quando}). Consegna già avvenuta, registrata a posteriori dal Customer Service.`
  const campi = {
    ...pre.campi,
    partnerId: artista.id,
    serviceTypeId: vendita.id,
    notes: [pre.campi.notes, `Prodotto: ${riga?.titolo ?? ''}`.trim(), notaFornitore].filter(Boolean).join('\n'),
    products: [{ productId: prodotto.id, quantity: Math.max(1, riga?.quantita ?? 1), price: pagata?.importo ?? 0, flexiblePrice: true }],
  }
  console.log(`\n${o.numero} · ${o.clienteNome} · ${o.citta} · consegna ${o.dataConsegna?.toISOString().slice(0, 10)} ${campi.deliveryTimeFrom}-${campi.deliveryTimeTo} · ritiro ${campi.pickupTimeFrom}-${campi.pickupTimeTo}`)
  console.log(`   prodotto: ${prodotto.nome} [${prodotto.sku}] (${comeScelto}) · prezzo flessibile ${pagata?.importo} € · DDT ${campi.ddtNumber} ${campi.ddtBrand} · a: ${campi.recipientFirstName} ${campi.recipientLastName}, ${campi.recipientAddress}`)
  if (!applica) continue

  const esito = await mandaInApp(o.id, campi, { id: '', nome: 'Recupero pagamenti in app (script 06/09)' })
  if (!esito.ok) { console.log(`   ✗ NON creata: ${esito.errore}`); continue }
  const idConsegna = esito.id ?? ''
  const numeroConsegna = esito.numero ?? ''
  console.log(`   ✓ creata consegna ${numeroConsegna || idConsegna}`)

  // ── In STORICO: consegnata alla data di consegna (fine fascia, ora locale) ──
  const fine = (campi.deliveryTimeTo ?? '18:00').padStart(5, '0')
  const giorno = (o.dataConsegna ?? new Date()).toISOString().slice(0, 10)
  const consegnataIl = new Date(`${giorno}T${fine}:00+02:00`)
  const dove = idConsegna ? `id = $2` : `"ddtNumber" = $2 AND "deletedAt" IS NULL`
  const chiave = idConsegna || o.numero.replace(/^#/, '')
  const n = await db.$executeRawUnsafe(
    `UPDATE platform."Delivery" SET status = 'delivered', "deliveredAt" = $1, "deliveredByPartner" = true, "updatedAt" = now() WHERE ${dove}`,
    consegnataIl, chiave
  )
  const idVero = idConsegna || ((await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM platform."Delivery" WHERE "ddtNumber" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1`, chiave))[0]?.id ?? '')
  if (idVero) {
    await db.$executeRawUnsafe(
      `INSERT INTO platform."DeliveryLog" (id, "deliveryId", type, message, "userId", "createdAt") VALUES ($1, $2, 'delivered', $3, 'app:customer', now())`,
      'cs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), idVero,
      `Stato: assigned -> delivered (registrata a posteriori dal Customer Service: consegna già avvenuta, fornitore pagato dall'app)`
    )
  }
  // ── Nel CS resta «Gestito» (lo era già), con lo stato della consegna copiato ──
  await db.ordine.update({
    where: { id: o.id },
    data: { gestione: 'gestito', gestioneDaNome: 'Piattaforma consegne', gestioneIl: new Date(), appConsegnaStato: 'delivered', appConsegnaData: o.dataConsegna, appConsegnaFascia: `${campi.deliveryTimeFrom}-${campi.deliveryTimeTo}` },
  })
  console.log(`   ✓ in storico: consegnata il ${consegnataIl.toLocaleString('it-IT')} (righe piattaforma: ${n}); CS: Gestito`)
  fatte++
}
console.log(applica ? `\nFATTE ${fatte} su ${daFare.length}.` : `\nNiente scritto: rilancia con --applica.`)
await db.$disconnect()
