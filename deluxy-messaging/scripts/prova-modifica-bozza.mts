// PROVA DAL VIVO della modifica di una bozza (10/09/2026).
//
// Crea una bozza DI PROVA sul negozio scelto (cliente fittizio, senza email:
// Shopify non manda nessun invito), la rilegge come farebbe il modulo, la
// modifica (una riga in più, indirizzo e data diversi), la rilegge, poi la
// CANCELLA su Shopify e toglie la riga di lavoro. Alla fine sul negozio non
// resta niente.
//
// ⚠️ Scrive davvero su Shopify (una bozza, poi cancellata): usarlo con un
// negozio vero solo sapendo cosa fa. Non crea ordini: una bozza non pagata
// non è un ordine.
//
// Uso: npx tsx scripts/prova-modifica-bozza.mts <dominio.myshopify.com>

import { config } from 'dotenv'
config({ path: '.env' })

const dominio = process.argv[2] || 'deluxygifts.myshopify.com'
const { db } = await import('../src/lib/db')
const { creaOrdine, aggiornaBozza } = await import('../src/lib/nuovo-ordine')
const { leggiBozzaPerModifica } = await import('../src/lib/bozze')

let falliti = 0
function prova(nome: string, ok: boolean, dettaglio?: unknown) {
  console.log(`${ok ? 'ok  ' : 'KO  '} ${nome}${ok ? '' : ` — ${JSON.stringify(dettaglio)}`}`)
  if (!ok) falliti++
}

const n = await db.negozioShopify.findFirst({ where: { dominio } })
if (!n) throw new Error(`negozio ${dominio} non trovato`)
const oggi = new Date()
const fra = (g: number) => new Date(oggi.getTime() + g * 86400000).toISOString().slice(0, 10)

const base = {
  negozioId: n.id,
  cliente: { nome: 'Prova', cognome: 'Modifica Bozza', email: '', telefono: '+39 333 123 4567' },
  destinatario: { nome: 'Destinatario', cognome: 'Di Prova', telefono: '+39 333 765 4321' },
  consensoMarketing: false,
  consegna: { data: fra(3), fascia: '10-11', indirizzo: 'Via di Prova 1', civicoNote: 'citofono A', cap: '20121', citta: 'Milano', provincia: 'MI', paese: 'IT' },
  righe: [{ titolo: 'Prodotto di prova', prezzo: 10, quantita: 1 }],
  biglietto: 'Biglietto di prova',
  spedizione: { titolo: 'Consegna offerta', prezzo: 0 },
  anonima: true,
  pagamento: 'link' as const,
  mezzoPagamento: '',
  aggiungiIva: false,
  operatore: { id: 'prova', nome: 'Script di prova' },
}

const creata = await creaOrdine(base)
if (!creata.ok) throw new Error('creazione fallita: ' + creata.errore)
console.log('bozza di prova creata:', creata.bozzaId)
const riga = await db.ordineCreato.findFirst({ where: { bozzaId: creata.bozzaId } })
if (!riga) throw new Error('riga OrdineCreato non trovata')

try {
  // 1) rilettura
  const letta = await leggiBozzaPerModifica(riga.id)
  prova('rilettura ok', letta.ok, letta)
  if (letta.ok) {
    const b = letta.bozza
    prova('cliente riletto', b.cliente.nome === 'Prova' && b.cliente.cognome === 'Modifica Bozza' && b.cliente.telefono.replace(/[^0-9]/g, '').endsWith('3331234567'), b.cliente)
    prova('destinatario riletto', b.destinatario?.nome === 'Destinatario' && b.destinatario?.cognome === 'Di Prova' && (b.destinatario?.telefono ?? '').replace(/[^0-9]/g, '').endsWith('3337654321'), b.destinatario)
    prova('consegna riletta', b.consegna.data === fra(3) && b.consegna.fascia === '10-11' && b.consegna.indirizzo === 'Via di Prova 1' && b.consegna.civicoNote === 'citofono A' && b.consegna.cap === '20121' && b.consegna.citta === 'Milano' && b.consegna.provincia === 'MI', b.consegna)
    prova('riga riletta', b.righe.length === 1 && b.righe[0].titolo === 'Prodotto di prova' && b.righe[0].prezzo === 10 && !b.righe[0].variantId, b.righe)
    prova('biglietto e anonima riletti', b.biglietto === 'Biglietto di prova' && b.anonima === true, { biglietto: b.biglietto, anonima: b.anonima })
    prova('consegna offerta riletta', b.spedizione.titolo === 'Consegna offerta' && b.spedizione.prezzo === 0, b.spedizione)
    prova('IVA non aggiunta riletta', b.aggiungiIva === false, b.aggiungiIva)
    prova('link presente', Boolean(b.link), b.link)
  }

  // 2) modifica
  const agg = await aggiornaBozza(riga.id, {
    ...base,
    consegna: { ...base.consegna, data: fra(4), fascia: '11-12', indirizzo: 'Via Nuova 2', civicoNote: 'secondo piano' },
    righe: [{ titolo: 'Prodotto di prova', prezzo: 10, quantita: 2 }, { titolo: 'Secondo prodotto', prezzo: 5.5, quantita: 1 }],
    biglietto: 'Biglietto cambiato',
    anonima: false,
    spedizione: { titolo: 'Consegna Milano', prezzo: 15 },
  })
  prova('aggiornamento ok', agg.ok, agg)
  if (agg.ok) {
    prova('stessa bozza (id uguale)', agg.bozzaId === creata.bozzaId, { prima: creata.bozzaId, dopo: agg.bozzaId })
    prova('stesso link', agg.linkPagamento === creata.linkPagamento, { prima: creata.linkPagamento, dopo: agg.linkPagamento })
  }
  const riletta = await leggiBozzaPerModifica(riga.id)
  prova('rilettura dopo modifica ok', riletta.ok, riletta)
  if (riletta.ok) {
    const b = riletta.bozza
    prova('data/fascia/indirizzo nuovi', b.consegna.data === fra(4) && b.consegna.fascia === '11-12' && b.consegna.indirizzo === 'Via Nuova 2' && b.consegna.civicoNote === 'secondo piano', b.consegna)
    prova('due righe, quantità 2', b.righe.length === 2 && b.righe[0].quantita === 2 && b.righe[1].prezzo === 5.5, b.righe)
    prova('biglietto nuovo, non anonima', b.biglietto === 'Biglietto cambiato' && b.anonima === false, { biglietto: b.biglietto, anonima: b.anonima })
    prova('spedizione nuova', b.spedizione.titolo === 'Consegna Milano' && b.spedizione.prezzo === 15, b.spedizione)
  }
  const r2 = await db.ordineCreato.findUnique({ where: { id: riga.id } })
  prova('riga di lavoro: importo aggiornato (10·2 + 5,5 + 15 = 40,5)', Math.abs((r2?.importo ?? 0) - 40.5) < 0.01, r2?.importo)

  // 3) rifiuti
  const altro = await db.negozioShopify.findFirst({ where: { id: { not: n.id } } })
  if (altro) {
    const cambio = await aggiornaBozza(riga.id, { ...base, negozioId: altro.id })
    prova('cambiare negozio è rifiutato', !cambio.ok && /negozio/.test(cambio.ok ? '' : cambio.errore), cambio)
  }
  const pagato = await aggiornaBozza(riga.id, { ...base, pagamento: 'pagato', mezzoPagamento: 'Contanti' })
  prova('«pagato» in modifica è rifiutato', !pagato.ok && /Segna pagata/.test(pagato.ok ? '' : pagato.errore), pagato)
} finally {
  // 4) pulizia: via la bozza da Shopify e la riga di lavoro
  const { decifra } = await import('../src/lib/crypto')
  const tok = await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: n.clientId, client_secret: decifra(n.clientSecret) }),
  }).then((r) => r.json() as Promise<{ access_token?: string }>)
  const del = await fetch(`https://${n.dominio}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tok.access_token ?? '' },
    body: JSON.stringify({
      query: `mutation elimina($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`,
      variables: { input: { id: creata.bozzaId } },
    }),
  }).then((r) => r.json() as Promise<{ data?: { draftOrderDelete?: { deletedId?: string; userErrors?: { message: string }[] } } }>)
  prova('bozza di prova cancellata su Shopify', del.data?.draftOrderDelete?.deletedId === creata.bozzaId, del)
  await db.ordineCreato.delete({ where: { id: riga.id } }).catch(() => {})
  await db.$disconnect()
}
console.log(falliti ? `\n${falliti} prove fallite` : '\nTutte le prove passate')
process.exit(falliti ? 1 : 0)
