// LE CHIAMATE: chi ci ha telefonato, e chi va richiamato.
//
// Il centralino manda una notifica a `chiamate@deluxy.it` per ogni telefonata.
// Prima quelle mail non le leggeva nessuno: chi chiamava e non trovava risposta
// spariva, e il giorno dopo nessuno sapeva che avesse provato. Una chiamata
// persa non lascia traccia da sola — è l'unico canale che si cancella da solo.
//
// ⚠️⚠️ UNA CHIAMATA NON È UNA CONVERSAZIONE, e per questo non entra in inbox:
// non c'è un testo da leggere né una risposta da scrivere, c'è una persona che
// voleva parlare e non ha parlato. L'unica domanda è **richiamato o no**.
//
// ⚠️ COSA SI RICONOSCE, e con quanta fiducia:
//   `ordine`      un ordine SUO è aperto sulla bacheca: la chiamata si attacca
//                 a quell'ordine e si vede da lì;
//   `cliente`     lo conosciamo (ordini nell'archivio di Orders) ma niente di
//                 aperto: si richiama sapendo chi è;
//   `sconosciuto` non risulta nostro cliente. Va richiamato lo stesso — ma chi
//                 lo fa deve saperlo PRIMA di dire «buongiorno, per il suo
//                 ordine»: è la differenza fra un servizio e una figuraccia.
//
// ⚠️⚠️ IL RICONOSCIMENTO È PER TELEFONO, con la stessa chiave del resto
// dell'app (`cifreTelefono`: le ultime 9 cifre, così un numero salvato con o
// senza prefisso è lo stesso). Mai per nome: gli omonimi esistono, e attaccare
// la telefonata di uno all'ordine di un altro è il modo di richiamare la
// persona sbagliata parlandole di una consegna che non ha mai ordinato.

import { db } from './db'
import { cifreTelefono } from './scheda-cliente'
import { cercaInArchivio } from './orders'
import { brandRicercaDaNegozio } from './negozi'

export type EsitoChiamata = 'ordine' | 'cliente' | 'sconosciuto'

// ── I NUMERI DENTRO LA NOTIFICA ──────────────────────────────────────────────
//
// ⚠️⚠️ IL FORMATO DELLA NOTIFICA NON LO DECIDIAMO NOI, e oggi (26/08/2026) non
// ne abbiamo ancora una vera da leggere: la casella è appena stata aperta. Per
// questo il riconoscimento è scritto per essere **smentibile**: prova le forme
// più comuni, e quando non capisce **lo dice** invece di indovinare. Il testo
// intero della notifica si conserva e si vede in pagina, così chi guarda può
// sempre leggere quello che è arrivato davvero e correggere il numero a mano.
//
// La prova sul campo si fa quando arriva la prima notifica vera: quel giorno si
// misura quante si riconoscono, e se la copertura è bassa si aggiungono le
// etichette del centralino che usiamo (vedi `scripts/prova-chiamate.mts`).

/** Le etichette che precedono il numero di CHI CHIAMA, nelle notifiche note. */
const ETICHETTE_CHIAMANTE = [
  'chiamata da',
  'chiamata persa da',
  'chiamante',
  'numero chiamante',
  'da numero',
  'mittente',
  'caller',
  'call from',
  'from',
  'da',
]

/** Le etichette che precedono il NOSTRO numero, quello che ha squillato. */
const ETICHETTE_CHIAMATO = [
  'numero chiamato',
  'chiamato',
  'destinazione',
  'verso',
  'called',
  'to',
  'a',
]

/**
 * Un numero di telefono plausibile: almeno 8 cifre, eventualmente con prefisso,
 * spazi, punti, trattini o parentesi.
 *
 * ⚠️ Le DATE assomigliano ai telefoni: «26/08/2026» ridotto a cifre fa 8 cifre
 * esatte, e senza un filtro entrerebbe in elenco come numero di un chiamante che
 * non esiste. Si scartano i candidati che contengono `/` o `:` (date e orari) e
 * quelli che non cominciano come un numero italiano o internazionale.
 */
const RE_NUMERO = /(\+?\d[\d\s().\-\/:]{6,24}\d)/g

function numeroPulito(grezzo: string): string {
  const testo = grezzo.trim()
  // Date («26/08/2026») e orari («10:35:12»): non sono telefoni.
  if (/[\/:]/.test(testo)) return ''
  const piu = testo.startsWith('+')
  const cifre = testo.replace(/\D/g, '')
  if (cifre.length < 8 || cifre.length > 15) return ''
  // Un numero comincia con + (internazionale), 00 (internazionale), 3 (mobile
  // italiano) o 0 (fisso italiano). Un codice qualsiasi di 10 cifre no.
  if (!piu && !/^(00|3|0)/.test(cifre)) return ''
  return piu ? `+${cifre}` : cifre
}

function dopoEtichetta(testo: string, etichette: string[]): string {
  for (const e of etichette) {
    // `etichetta` seguita da due punti, trattino o spazio, poi il numero.
    const re = new RegExp(`(?:^|[^a-z])${e}\\s*[:\\-–]?\\s*(\\+?[\\d][\\d\\s().\\-]{6,24}[\\d])`, 'i')
    const m = testo.match(re)
    if (m) {
      const n = numeroPulito(m[1])
      if (n) return n
    }
  }
  return ''
}

export type NumeriNotifica = {
  /** Il numero di chi ha chiamato. Vuoto = non riconosciuto. */
  chiamante: string
  /** Il nostro numero che ha squillato. Vuoto = la notifica non lo dice. */
  chiamato: string
  /** Come l'abbiamo capito: serve a sapere quanto fidarsi. */
  come: 'etichetta' | 'primo numero' | 'niente'
}

export function numeriDaNotifica(oggetto: string, testo: string): NumeriNotifica {
  const tutto = `${oggetto ?? ''}\n${testo ?? ''}`

  const conEtichetta = dopoEtichetta(tutto, ETICHETTE_CHIAMANTE)
  const chiamato = dopoEtichetta(tutto, ETICHETTE_CHIAMATO)
  if (conEtichetta) {
    return { chiamante: conEtichetta, chiamato: chiamato === conEtichetta ? '' : chiamato, come: 'etichetta' }
  }

  // Nessuna etichetta riconosciuta: si prende il primo numero plausibile del
  // testo. ⚠️ È un ripiego, e si dichiara (`come`): in pagina la riga lo scrive,
  // perché un numero preso alla cieca può benissimo essere il NOSTRO.
  const candidati: string[] = []
  for (const m of tutto.matchAll(RE_NUMERO)) {
    const n = numeroPulito(m[1])
    if (n && !candidati.includes(n)) candidati.push(n)
  }
  if (candidati.length === 0) return { chiamante: '', chiamato: '', come: 'niente' }
  return { chiamante: candidati[0], chiamato: chiamato || candidati[1] || '', come: 'primo numero' }
}

// ── CHI HA CHIAMATO ──────────────────────────────────────────────────────────

export type Riconoscimento = {
  esito: EsitoChiamata
  ordineId: string
  ordineNumero: string
  clienteNome: string
  email: string
  negozioId: string | null
}

const NIENTE: Riconoscimento = {
  esito: 'sconosciuto',
  ordineId: '',
  ordineNumero: '',
  clienteNome: '',
  email: '',
  negozioId: null,
}

/** Il negozio locale che corrisponde a un brand di Orders. Sola lettura. */
async function negozioDelBrand(brand: string): Promise<string | null> {
  const b = brandRicercaDaNegozio(brand, '').toLowerCase()
  if (!b) return null
  const negozi = await db.negozioShopify.findMany({
    select: { id: true, nome: true, dominio: true, brandRicerca: true },
  })
  // ⚠️ Non si CREA un negozio da qui. Crearlo lo fa la sincronizzazione degli
  // ordini, che sa cosa sta importando; una telefonata non è una fonte
  // sufficiente per far nascere un marchio in configurazione.
  const trovato = negozi.find(
    (n) => brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca).toLowerCase() === b
  )
  return trovato ? trovato.id : null
}

/**
 * Chi è, per quel che ne sappiamo.
 *
 * ⚠️⚠️ L'archivio si interroga con le 9 cifre, ma la risposta si **verifica**:
 * `/api/v1/ordini?q=` cerca la parola in una dozzina di campi (indirizzo, note,
 * cap…), quindi «trovato» non vuol dire «è il suo numero». Si tengono solo gli
 * ordini il cui telefono ha davvero quelle 9 cifre. Cercare non è affermare.
 */
export async function riconosciChiamante(numero: string): Promise<Riconoscimento> {
  const cifre = cifreTelefono(numero)
  if (!cifre) return NIENTE

  // 1. Un ordine sulla bacheca: è il legame più forte, e ha un id da mostrare.
  //    ⚠️ Gli annullati no: richiamare per un ordine annullato è peggio che
  //    richiamare senza sapere niente.
  const locale = await db.ordine.findFirst({
    where: { telefono: { contains: cifre }, annullatoIl: null },
    orderBy: { data: 'desc' },
    select: { id: true, numero: true, clienteNome: true, email: true, negozioId: true },
  })
  if (locale) {
    return {
      esito: 'ordine',
      ordineId: locale.id,
      ordineNumero: locale.numero,
      clienteNome: locale.clienteNome,
      email: locale.email,
      negozioId: locale.negozioId,
    }
  }

  // 2. L'archivio di Orders: la nostra copia locale tiene ~60 giorni, la storia
  //    vera sta là. Serve a non trattare da sconosciuto un cliente di marzo.
  const archivio = await cercaInArchivio(cifre, 20)
  if (archivio.stato === 'ok') {
    const suoi = archivio.ordini.filter((o) => cifreTelefono(o.telefono) === cifre)
    if (suoi.length > 0) {
      const ultimo = suoi[0]
      return {
        esito: 'cliente',
        ordineId: '',
        ordineNumero: ultimo.numero,
        clienteNome: ultimo.clienteNome,
        email: ultimo.email,
        negozioId: await negozioDelBrand(ultimo.brand),
      }
    }
  }

  return NIENTE
}

/** Il marchio a cui appartiene il numero che ha squillato. */
async function negozioDelNumeroChiamato(numeroChiamato: string): Promise<string | null> {
  const cifre = cifreTelefono(numeroChiamato)
  if (!cifre) return null
  const negozi = await db.negozioShopify.findMany({
    where: { NOT: { telefonoChiamate: '' } },
    select: { id: true, telefonoChiamate: true },
  })
  const trovato = negozi.find((n) => cifreTelefono(n.telefonoChiamate) === cifre)
  return trovato ? trovato.id : null
}

// ── DALLA NOTIFICA ALLA RIGA ─────────────────────────────────────────────────

export type MailNotifica = {
  idEsterno: string
  oggetto: string
  testo: string
  data: Date
  /** Il mittente della notifica: è il centralino, non il cliente. */
  da: string
  nome: string
}

export type EsitoRegistrazione = { stato: 'nuova' | 'gia'; id: string }

/**
 * Registra una notifica di chiamata e apre il promemoria per richiamare.
 *
 * ⚠️⚠️ IL PROMEMORIA NASCE INSIEME ALLA CHIAMATA, non dopo. Una riga in un
 * elenco che nessuno ha il dovere di aprire è una chiamata persa scritta meglio:
 * il «da fare» della schermata Oggi è il posto in cui si guarda davvero, e per
 * questo la richiesta di richiamare nasce lì.
 */
export async function registraChiamataDaMail(
  m: MailNotifica,
  casella: { id: string; negozioId?: string | null }
): Promise<EsitoRegistrazione> {
  if (m.idEsterno) {
    const gia = await db.chiamata.findFirst({
      where: { idEsterno: m.idEsterno },
      select: { id: true },
    })
    if (gia) return { stato: 'gia', id: gia.id }
  }

  const numeri = numeriDaNotifica(m.oggetto, m.testo)
  const r = numeri.chiamante ? await riconosciChiamante(numeri.chiamante) : NIENTE

  // Il marchio, in ordine di certezza: quello dell'ordine riconosciuto, poi il
  // nostro numero che ha squillato, poi il marchio della casella. Nessuno dei
  // tre = «senza marchio», che è una risposta e non un buco da tappare.
  const negozioId =
    r.negozioId ?? (await negozioDelNumeroChiamato(numeri.chiamato)) ?? casella.negozioId ?? null

  const chiamata = await db.chiamata.create({
    data: {
      idEsterno: m.idEsterno,
      casellaId: casella.id,
      quando: m.data,
      numero: numeri.chiamante,
      cifre: cifreTelefono(numeri.chiamante),
      numeroChiamato: numeri.chiamato,
      // ⚠️ Il nome NON si prende dalla notifica: il centralino scrive quello che
      // ha in rubrica lui, che può essere di un'altra persona. Qui sta solo il
      // nome che sappiamo NOI, cioè quello dell'ordine riconosciuto.
      chiamante: r.clienteNome,
      oggetto: m.oggetto.slice(0, 300),
      testo: m.testo.slice(0, 8000),
      negozioId,
      esito: r.esito,
      ordineId: r.ordineId,
      ordineNumero: r.ordineNumero,
      clienteNome: r.clienteNome,
      email: r.email,
    },
  })

  const chi = r.clienteNome || numeri.chiamante || 'numero sconosciuto'
  const testoAttivita =
    r.esito === 'ordine'
      ? `Richiamare ${chi} — ha chiamato per l'ordine ${r.ordineNumero}`
      : r.esito === 'cliente'
        ? `Richiamare ${chi} — cliente, ultimo ordine ${r.ordineNumero}`
        : `Richiamare ${numeri.chiamante || 'il numero della notifica'} — NON risulta nostro cliente`

  const attivita = await db.attivita.create({
    data: {
      testo: testoAttivita,
      ordineId: r.ordineId,
      riferimento: r.ordineNumero ? `ordine ${r.ordineNumero}` : numeri.chiamante,
      utenteNome: 'Chiamate',
    },
  })

  await db.chiamata.update({ where: { id: chiamata.id }, data: { attivitaId: attivita.id } })
  return { stato: 'nuova', id: chiamata.id }
}

// ── L'ELENCO ─────────────────────────────────────────────────────────────────

export type ChiamataDto = {
  id: string
  quando: string
  numero: string
  numeroChiamato: string
  chiamante: string
  oggetto: string
  testo: string
  esito: EsitoChiamata
  ordineId: string
  ordineNumero: string
  clienteNome: string
  email: string
  negozioId: string
  negozioNome: string
  richiamataIl: string | null
  richiamataDaNome: string
  esitoRichiamata: string
}

export type ElencoChiamate = {
  chiamate: ChiamataDto[]
  /** Quante restano da richiamare, per marchio: è il titolo delle colonne. */
  perMarchio: { negozioId: string; nome: string; daRichiamare: number; totale: number }[]
  daRichiamare: number
}

export async function elencoChiamate(opzioni?: {
  giorni?: number
  soloDaRichiamare?: boolean
  negozioId?: string
}): Promise<ElencoChiamate> {
  const giorni = opzioni?.giorni ?? 30
  const dal = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000)

  const [righe, negozi] = await Promise.all([
    db.chiamata.findMany({
      where: {
        quando: { gte: dal },
        ...(opzioni?.soloDaRichiamare ? { richiamataIl: null } : {}),
        ...(opzioni?.negozioId ? { negozioId: opzioni.negozioId } : {}),
      },
      orderBy: { quando: 'desc' },
      take: 300,
    }),
    db.negozioShopify.findMany({ select: { id: true, nome: true } }),
  ])

  const nomeDi = new Map(negozi.map((n) => [n.id, n.nome]))

  // ⚠️ Il conteggio per marchio si fa su TUTTE le chiamate del periodo, non
  // sulle 300 caricate: un elenco tagliato che alimenta anche il totale fa
  // sparire proprio le più vecchie, cioè quelle che aspettano da più tempo.
  const conteggi = await db.chiamata.groupBy({
    by: ['negozioId'],
    where: { quando: { gte: dal } },
    _count: { _all: true },
  })
  const aperte = await db.chiamata.groupBy({
    by: ['negozioId'],
    where: { quando: { gte: dal }, richiamataIl: null },
    _count: { _all: true },
  })
  const aperteDi = new Map(aperte.map((a) => [a.negozioId ?? '', a._count._all]))

  const perMarchio = conteggi
    .map((c) => ({
      negozioId: c.negozioId ?? '',
      nome: c.negozioId ? (nomeDi.get(c.negozioId) ?? 'Marchio sconosciuto') : 'Senza marchio',
      totale: c._count._all,
      daRichiamare: aperteDi.get(c.negozioId ?? '') ?? 0,
    }))
    .sort((a, b) => b.daRichiamare - a.daRichiamare || b.totale - a.totale)

  return {
    chiamate: righe.map((c) => ({
      id: c.id,
      quando: c.quando.toISOString(),
      numero: c.numero,
      numeroChiamato: c.numeroChiamato,
      chiamante: c.chiamante,
      oggetto: c.oggetto,
      testo: c.testo,
      esito: c.esito as EsitoChiamata,
      ordineId: c.ordineId,
      ordineNumero: c.ordineNumero,
      clienteNome: c.clienteNome,
      email: c.email,
      negozioId: c.negozioId ?? '',
      negozioNome: c.negozioId ? (nomeDi.get(c.negozioId) ?? '') : '',
      richiamataIl: c.richiamataIl ? c.richiamataIl.toISOString() : null,
      richiamataDaNome: c.richiamataDaNome,
      esitoRichiamata: c.esitoRichiamata,
    })),
    perMarchio,
    daRichiamare: perMarchio.reduce((s, m) => s + m.daRichiamare, 0),
  }
}

/**
 * Segna che il cliente è stato richiamato.
 *
 * ⚠️⚠️ Spunta ANCHE il promemoria collegato. Due liste che dicono cose diverse
 * sulla stessa telefonata — «richiamato» qui e «da fare» in Oggi — sono peggio
 * di una lista sola: si richiama due volte, e la seconda volta il cliente
 * risponde che ne aveva già parlato con un collega.
 */
export async function segnaRichiamata(
  id: string,
  dati: { esito: string; chi: string }
): Promise<{ ok: boolean; errore?: string }> {
  const c = await db.chiamata.findUnique({ where: { id }, select: { attivitaId: true } })
  if (!c) return { ok: false, errore: 'Chiamata non trovata.' }

  await db.chiamata.update({
    where: { id },
    data: {
      richiamataIl: new Date(),
      richiamataDaNome: dati.chi.slice(0, 80),
      esitoRichiamata: dati.esito.slice(0, 2000),
    },
  })

  if (c.attivitaId) {
    await db.attivita
      .update({ where: { id: c.attivitaId }, data: { fatta: true, fattaIl: new Date() } })
      .catch(() => {
        // Il promemoria può essere stato cancellato a mano: non è un errore, e
        // non deve impedire di segnare la richiamata.
      })
  }
  return { ok: true }
}

/** Corregge a mano il numero di una chiamata, e rifà il riconoscimento. */
export async function correggiNumero(id: string, numero: string): Promise<{ ok: boolean; errore?: string }> {
  const pulito = numeroPulito(numero) || numero.trim()
  if (!cifreTelefono(pulito)) {
    return { ok: false, errore: 'Servono almeno 9 cifre: un numero più corto non identifica nessuno.' }
  }
  const r = await riconosciChiamante(pulito)
  await db.chiamata.update({
    where: { id },
    data: {
      numero: pulito,
      cifre: cifreTelefono(pulito),
      esito: r.esito,
      ordineId: r.ordineId,
      ordineNumero: r.ordineNumero,
      clienteNome: r.clienteNome,
      email: r.email,
      // ⚠️ Il marchio già scritto non si cancella se il riconoscimento nuovo non
      // ne trova uno: un dato che c'era non si perde correggendone un altro.
      ...(r.negozioId ? { negozioId: r.negozioId } : {}),
    },
  })
  return { ok: true }
}

// ── LE CHIAMATE DI UN ORDINE (per la bacheca) ────────────────────────────────

export type ChiamateDiUnOrdine = {
  quante: number
  ultima: Date
  daRichiamare: number
}

/**
 * Le chiamate degli ordini in elenco, in una query sola.
 *
 * ⚠️ In LISTA e non solo nel dettaglio: la bacheca si scorre, e un dato che
 * esiste solo dentro un pannello che si apre a richiesta lo vede chi era già
 * andato a cercarlo (stessa ragione dei segnali di pagamento e frode).
 */
export async function chiamateDegliOrdini(
  ordini: { id: string }[]
): Promise<Map<string, ChiamateDiUnOrdine>> {
  const ids = ordini.map((o) => o.id).filter(Boolean)
  const fuori = new Map<string, ChiamateDiUnOrdine>()
  if (ids.length === 0) return fuori

  const righe = await db.chiamata.findMany({
    where: { ordineId: { in: ids } },
    select: { ordineId: true, quando: true, richiamataIl: true },
    orderBy: { quando: 'desc' },
  })
  for (const c of righe) {
    const prec = fuori.get(c.ordineId)
    fuori.set(c.ordineId, {
      quante: (prec?.quante ?? 0) + 1,
      // Le righe arrivano dalla più recente: la prima che si vede è l'ultima.
      ultima: prec?.ultima ?? c.quando,
      daRichiamare: (prec?.daRichiamare ?? 0) + (c.richiamataIl ? 0 : 1),
    })
  }
  return fuori
}
