/**
 * I METODI DI PAGAMENTO COME LI DICE IL SITO (11/09/2026, richiesta utente:
 * «riempi le impostazioni di pagamento cercando già ora cosa dice deluxy.it in
 * caso di selezione di questi altri metodi di pagamento»).
 *
 * ⚠️⚠️ I nomi e i testi qui sotto NON sono inventati: sono stati LETTI dal
 * checkout vero dei tre negozi l'11/09/2026, aprendo una bozza di prova per
 * negozio (poi cancellata) e selezionando uno per uno i metodi manuali. Non
 * esiste un modo di chiederli all'API: sull'Admin API 2025-01 non c'è nessun
 * tipo per i gateway manuali (introspezione: solo `PaymentSettings`, che porta
 * i portafogli digitali). Per questo stanno scritti qui, con la data.
 *
 * Che cosa è stato misurato, negozio per negozio:
 *
 *   deluxy.it        Contrassegno · Deposito bancario · PostePay · Binance / Crypto
 *                    (+ Satispay, Klarna, PayPal, Carta, Crypto USDC: gateway veri)
 *   cakedesign.me    Deposito bancario · Postepay (Italia) · Binance / Crypto
 *   deluxyflowers.com Deposito bancario · PostePay (Italia) · Binance / Crypto
 *
 * ⚠️ Il nome cambia da negozio a negozio («PostePay» su Deluxy, «Postepay
 * (Italia)» su Cake, «PostePay (Italia)» su Flowers) e cambia anche il testo
 * («Paga tramite bonifico bancario» contro «Pagamento tramite bonifico»): per
 * questo ogni riga è legata al suo negozio invece di essercene una sola. Il
 * cliente al telefono deve sentirsi dire la stessa cosa che leggerebbe sul sito.
 *
 * ⚠️ Idempotente: ogni riga si riconosce da nome + negozio e si aggiorna.
 * Le sei righe seminate dalla migrazione (nomi generici, testi nostri) si
 * tolgono, perché erano un ripiego in attesa di questa misura.
 *
 * Uso: npx tsx scripts/metodi-dai-negozi.mts [--esegui]
 */
import { db } from '../src/lib/db'

const esegui = process.argv.includes('--esegui')

type Riga = {
  nome: string
  negozio: string | null
  comeNasce: 'da-incassare' | 'pagato'
  quandoDovuto: 'consegna' | 'ricevuta'
  istruzioni: string
  notaConsegna: string
  attributo: string
  posizione: number
}

const RIGHE: Riga[] = [
  // ── IL CONTRASSEGNO ──
  // Sul sito lo offre solo deluxy.it, ma la riga vale per TUTTI i negozi: qui
  // l'ordine non nasce da un checkout, nasce da una telefonata — il contrassegno
  // è un accordo col cliente, non una voce della cassa del sito. Il testo è
  // quello che deluxy.it dice, parola per parola, così chi risponde al telefono
  // e chi legge il sito sentono la stessa frase.
  {
    nome: 'Contrassegno',
    negozio: null,
    comeNasce: 'da-incassare',
    quandoDovuto: 'consegna',
    istruzioni: 'Paga comodamente in contanti alla consegna',
    notaConsegna: 'DA INCASSARE ALLA CONSEGNA — contanti: l’ordine non è pagato.',
    attributo: 'Pagamento_Alla_Consegna',
    posizione: 10,
  },

  // ── IL BONIFICO ──
  // ⚠️ Il testo è diverso su Deluxy e sugli altri due, ed è così sul sito:
  // «Paga tramite bonifico bancario» contro «Pagamento tramite bonifico».
  // ⚠️⚠️ Nessuno dei tre dà le COORDINATE al checkout: il cliente legge «paga
  // con un bonifico» e non sa dove. Si è lasciato il testo del sito e lo si
  // dice a chi usa l'app, invece di inventare un IBAN qui dentro.
  {
    nome: 'Deposito bancario',
    negozio: 'Deluxy',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Paga tramite bonifico bancario',
    notaConsegna: '',
    attributo: '',
    posizione: 20,
  },
  {
    nome: 'Deposito bancario',
    negozio: 'Cake',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Pagamento tramite bonifico',
    notaConsegna: '',
    attributo: '',
    posizione: 20,
  },
  {
    nome: 'Deposito bancario',
    negozio: 'FLowers',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Pagamento tramite bonifico',
    notaConsegna: '',
    attributo: '',
    posizione: 20,
  },

  // ── POSTEPAY ──
  // Il numero è quello scritto sul checkout di Deluxy e di Cake.
  // ⚠️ Su Flowers il sito NON dice niente quando si sceglie PostePay: il
  // cliente resta senza istruzioni. Qui si scrive la stessa frase degli altri
  // due — è lo stesso numero — e la mancanza sul sito va sistemata di là.
  {
    nome: 'PostePay',
    negozio: 'Deluxy',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Effettuare il pagamento e inviare la ricevuta a +39 02 8295 2899',
    notaConsegna: '',
    attributo: '',
    posizione: 30,
  },
  {
    nome: 'Postepay (Italia)',
    negozio: 'Cake',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Effettuare il pagamento e inviare la ricevuta a +39 02 8295 2899',
    notaConsegna: '',
    attributo: '',
    posizione: 30,
  },
  {
    nome: 'PostePay (Italia)',
    negozio: 'FLowers',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Effettuare il pagamento e inviare la ricevuta a +39 02 8295 2899',
    notaConsegna: '',
    attributo: '',
    posizione: 30,
  },

  // ── CRYPTO ──
  // Il conto è lo stesso sui tre negozi; su Flowers il sito scrive «Account:»
  // coi due punti. Si tiene il testo del sito, senza normalizzarlo.
  {
    nome: 'Binance / Crypto',
    negozio: 'Deluxy',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Account deluxy_white_gloves',
    notaConsegna: '',
    attributo: '',
    posizione: 40,
  },
  {
    nome: 'Binance / Crypto',
    negozio: 'Cake',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Account deluxy_white_gloves',
    notaConsegna: '',
    attributo: '',
    posizione: 40,
  },
  {
    nome: 'Binance / Crypto',
    negozio: 'FLowers',
    comeNasce: 'da-incassare',
    quandoDovuto: 'ricevuta',
    istruzioni: 'Account: deluxy_white_gloves',
    notaConsegna: '',
    attributo: '',
    posizione: 40,
  },
]

// I nomi seminati dalla migrazione: erano un ripiego, li sostituisce la misura.
const DA_TOGLIERE = [
  'Contanti alla consegna',
  'POS alla consegna',
  'Bonifico anticipato',
  'Bonifico già ricevuto',
  'Contanti (già presi)',
  'PayPal (già pagato)',
]

const negozi = await db.negozioShopify.findMany({ select: { id: true, nome: true } })
const idDi = (nome: string | null) => {
  if (!nome) return null
  const n = negozi.find((x) => x.nome === nome)
  if (!n) throw new Error(`negozio non trovato: ${nome}`)
  return n.id
}

console.log(esegui ? 'SCRIVO' : 'PROVA A SECCO (aggiungi --esegui per scrivere)')
for (const r of RIGHE) {
  const negozioId = idDi(r.negozio)
  const gia = await db.metodoPagamento.findFirst({ where: { nome: r.nome, negozioId } })
  console.log(
    `${gia ? 'aggiorno' : 'creo    '} ${r.nome}${r.negozio ? ` · ${r.negozio}` : ' · tutti i negozi'} — «${r.istruzioni}»`
  )
  if (!esegui) continue
  const dati = {
    nome: r.nome,
    attivo: true,
    posizione: r.posizione,
    negozioId,
    comeNasce: r.comeNasce,
    quandoDovuto: r.quandoDovuto,
    istruzioni: r.istruzioni,
    notaConsegna: r.notaConsegna,
    attributo: r.attributo,
  }
  if (gia) await db.metodoPagamento.update({ where: { id: gia.id }, data: dati })
  else await db.metodoPagamento.create({ data: dati })
}

const vecchi = await db.metodoPagamento.findMany({ where: { nome: { in: DA_TOGLIERE } }, select: { id: true, nome: true } })
for (const v of vecchi) console.log(`tolgo    ${v.nome} (riga seminata dalla migrazione)`)
if (esegui && vecchi.length) {
  await db.metodoPagamento.deleteMany({ where: { id: { in: vecchi.map((v) => v.id) } } })
}

if (esegui) {
  const finali = await db.metodoPagamento.findMany({ orderBy: [{ posizione: 'asc' }, { nome: 'asc' }] })
  console.log(`\nIn tabella adesso: ${finali.length} metodi`)
}
await db.$disconnect()
