import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'
import { brandRicercaDaNegozio } from '@/lib/negozi'
import { ultimoImportOrders } from '@/lib/orders'
import { ordiniConMessaggi } from '@/lib/messaggi-ordine'
import { inizioDomani, inizioOggi, limiteCalde } from '@/lib/urgenza'

export const dynamic = 'force-dynamic'

/**
 * Gli ordini in ordine di URGENZA, a fasce (vedi src/lib/urgenza.ts per il perché
 * non basta ordinare per data di consegna).
 *
 * Si ordina QUI e non nel browser perché l'elenco è tagliato a 200: ordinando a
 * valle si ordinerebbero i 200 più recenti, e un ordine da consegnare oggi ma
 * ricevuto tre settimane fa non entrerebbe nemmeno nella lista.
 *
 * Sono cinque query invece di una, ognuna con l'ordinamento che ha senso nella
 * sua fascia; si fermano appena raggiunto il tetto.
 */
async function ordiniPerUrgenza(dove: Prisma.OrdineWhereInput, tetto: number) {
  const oggi = inizioOggi()
  const domani = inizioDomani()
  const calde = limiteCalde()

  const fasce: { where: Prisma.OrdineWhereInput; orderBy: Prisma.OrdineOrderByWithRelationInput[] }[] = [
    // 0. PRIMA DI TUTTO: fascia oraria SENZA giorno. È il caso peggiore.
    //
    // ⚠️ Su Shopify l'attributo della data manca mentre la fascia c'è («12-16»):
    // qualcuno aspetta la consegna in una finestra precisa e noi non sappiamo di
    // che giorno — spesso è oggi. Finivano nel gruppo «senza data», cioè sotto
    // agli ordini di fra tre settimane, e passavano inosservati proprio perché
    // il calendario non sapeva dove metterli.
    // Il giorno NON si indovina: né dal tag «Oggi» di Shopify né dalla data
    // dell'ordine. Si porta in cima e lo guarda una persona.
    // Misurato: 16 ordini su 950.
    {
      where: { dataConsegna: null, NOT: { fasciaConsegna: '' } },
      orderBy: [{ data: 'desc' }],
    },
    // 1. Oggi, dalla fascia oraria più presto: è la coda di lavoro della giornata.
    {
      where: { dataConsegna: { gte: oggi, lt: domani } },
      orderBy: [{ fasciaConsegna: 'asc' }, { data: 'asc' }],
    },
    // 2. Domani e oltre, in ordine di calendario.
    { where: { dataConsegna: { gte: domani } }, orderBy: [{ dataConsegna: 'asc' }] },
    // 3. Scadute da pochi giorni: forse sono ancora lavoro aperto.
    {
      where: { dataConsegna: { gte: calde, lt: oggi } },
      orderBy: [{ dataConsegna: 'desc' }],
    },
    // 4. Senza data NÉ fascia: non si può dire se urgano, ma non devono sparire.
    //    (quelli con la fascia sono già usciti al gruppo 0)
    { where: { dataConsegna: null, fasciaConsegna: '' }, orderBy: [{ data: 'desc' }] },
    // 5. Scadute da tempo: quasi sempre consegnate e mai spuntate. Per ultime.
    { where: { dataConsegna: { lt: calde } }, orderBy: [{ dataConsegna: 'desc' }] },
  ]

  const out: Awaited<ReturnType<typeof db.ordine.findMany>> = []
  for (const f of fasce) {
    if (out.length >= tetto) break
    const righe = await db.ordine.findMany({
      where: { AND: [dove, f.where] },
      orderBy: f.orderBy,
      take: tetto - out.length,
    })
    out.push(...righe)
  }
  return out
}

/**
 * ORDINAMENTO SCELTO DA CHI GUARDA (le intestazioni cliccabili della tabella).
 *
 * ⚠️ Si ordina QUI per la stessa ragione dell'urgenza: la lista è tagliata a
 * 200 su un totale che può essere molto più grande. Ordinando nel browser si
 * riordinerebbero i 200 che il server ha già scelto — «il totale più alto»
 * sarebbe il più alto *fra quelli mostrati*, che è una risposta sbagliata data
 * con la faccia di una giusta.
 *
 * ⚠️ Le date di consegna mancanti stanno IN FONDO in tutt'e due i versi
 * (`nulls: 'last'`): «non indicata» non è una data, né la più vicina né la più
 * lontana, e in cima occuperebbe lo schermo con i 367 ordini che non ce l'hanno.
 *
 * Il numero d'ordine non è fra le colonne ordinabili di proposito: è testo, e i
 * tre negozi numerano con lunghezze diverse (#1623, #12121) — come testo
 * «#12121» verrebbe prima di «#1623». Per l'ordine cronologico c'è Data.
 */
const ORDINAMENTI: Record<
  string,
  {
    orderBy: (v: 'asc' | 'desc') => Prisma.OrdineOrderByWithRelationInput[]
    /**
     * La colonna di testo che può essere VUOTA. Il vuoto va in fondo in tutt'e
     * due i versi, come le date di consegna mancanti: sono 40 ordini senza nome
     * e 160 senza telefono su 1.216, e crescente aprivano l'elenco con
     * quaranta righe bianche — cioè non rispondevano alla domanda per cui uno
     * ha appena cliccato «Cliente».
     */
    campoVuoto?: 'negozioNome' | 'clienteNome' | 'clienteTipo' | 'telefono' | 'gestione'
  }
> = {
  negozio: { orderBy: (v) => [{ negozioNome: v }, { data: 'desc' }], campoVuoto: 'negozioNome' },
  data: { orderBy: (v) => [{ data: v }] },
  consegna: {
    orderBy: (v) => [{ dataConsegna: { sort: v, nulls: 'last' } }, { fasciaConsegna: 'asc' }],
  },
  cliente: { orderBy: (v) => [{ clienteNome: v }, { data: 'desc' }], campoVuoto: 'clienteNome' },
  tipo: { orderBy: (v) => [{ clienteTipo: v }, { data: 'desc' }], campoVuoto: 'clienteTipo' },
  telefono: { orderBy: (v) => [{ telefono: v }, { data: 'desc' }], campoVuoto: 'telefono' },
  totale: { orderBy: (v) => [{ totale: v }] },
  lavorazione: { orderBy: (v) => [{ gestione: v }, { data: 'desc' }] },
}

/** Gli ordini nell'ordine chiesto, col vuoto in coda. */
async function ordiniOrdinati(
  dove: Prisma.OrdineWhereInput,
  ordina: string,
  verso: 'asc' | 'desc',
  tetto: number
) {
  const scelta = ORDINAMENTI[ordina]
  if (!scelta) return ordiniPerUrgenza(dove, tetto)

  const orderBy = scelta.orderBy(verso)
  const campo = scelta.campoVuoto
  if (!campo) return db.ordine.findMany({ where: dove, orderBy, take: tetto })

  const vuoto = { [campo]: '' } as Prisma.OrdineWhereInput
  const pieni = await db.ordine.findMany({
    where: { AND: [dove, { NOT: vuoto }] },
    orderBy,
    take: tetto,
  })
  if (pieni.length >= tetto) return pieni
  // Chi il dato non ce l'ha viene dopo, ma viene: sparire dall'elenco perché
  // manca un campo è il modo di perdere un ordine senza accorgersene.
  const vuoti = await db.ordine.findMany({
    where: { AND: [dove, vuoto] },
    orderBy: [{ data: 'desc' }],
    take: tetto - pieni.length,
  })
  return [...pieni, ...vuoti]
}

// Lista ordini per la pagina Ordini, con ricerca e filtri:
//   q        testo su numero, cliente, telefono, email, indirizzo
//   negozio  id del negozio
//   contatto "si" | "no" (contatto già salvato in rubrica o no)
//   rimborsi "nascondi" = fuori gli ordini con una richiesta di rimborso viva
// Torna anche se Google è collegato (per abilitare i bottoni "Salva contatto").
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const contatto = (p.get('contatto') ?? '').trim()

  const gestione = (p.get('gestione') ?? '').trim()
  const tipoCliente = (p.get('tipoCliente') ?? '').trim()
  const rimborsi = (p.get('rimborsi') ?? '').trim()
  // Colonna su cui ordinare. Vuota (o sconosciuta) = l'ordine per urgenza, che
  // resta il modo giusto di guardare la lista di lavoro.
  const ordina = (p.get('ordina') ?? '').trim()
  const verso: 'asc' | 'desc' = (p.get('verso') ?? '') === 'desc' ? 'desc' : 'asc'

  const dove: Prisma.OrdineWhereInput = {}
  if (negozio) dove.negozioId = negozio
  // `ignoto` = gli ordini di cui Orders non sa dire il tipo di cliente: sono
  // quelli senza email, telefono né nome, e vale la pena poterli isolare.
  if (tipoCliente === 'ignoto') dove.clienteTipo = ''
  else if (tipoCliente) dove.clienteTipo = tipoCliente
  if (contatto === 'si') dove.contattoSalvato = true
  if (contatto === 'no') dove.contattoSalvato = false
  // `aperti` = tutto ciò che non è ancora gestito: è la vista di lavoro.
  if (gestione === 'aperti') dove.gestione = { not: 'gestito' }
  else if (gestione) dove.gestione = gestione

  // Un ordine su cui è stato APERTO UN RIMBORSO esce dalla lista di lavoro: da
  // quel momento non si lavora più la consegna, si lavora la richiesta, e
  // lasciarlo fra gli ordini aperti vuol dire che prima o poi qualcuno lo
  // rilavora per sbaglio. Si nasconde solo finché la richiesta è viva (da
  // approvare o approvata): rifiutata o annullata, l'ordine torna normale.
  // In «Ordini globali» non si nasconde niente — lì si cerca, non si lavora.
  if (rimborsi === 'nascondi') {
    const vivi = await db.rimborso.findMany({
      where: { stato: { in: ['richiesto', 'approvato'] } },
      select: { ordineId: true, ordineNumero: true },
    })
    // Il rimborso porta con sé sia l'id sia il numero, perché l'ordine può
    // vivere solo nell'archivio di Orders: si esclude su tutti e due.
    const ids = vivi.map((r) => r.ordineId).filter(Boolean)
    const numeri = vivi.map((r) => r.ordineNumero).filter(Boolean)
    const fuori: Prisma.OrdineWhereInput[] = []
    if (ids.length) fuori.push({ id: { in: ids } })
    if (numeri.length) fuori.push({ numero: { in: numeri } })
    if (fuori.length) dove.NOT = fuori
  }

  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [
      { numero: testo },
      { clienteNome: testo },
      { telefono: testo },
      { email: testo },
      { indirizzo: testo },
      { negozioNome: testo },
    ]
    // Cercando un numero di telefono, chi scrive spesso usa spazi o il prefisso:
    // confrontiamo anche le sole cifre, così "+39 333 12" trova "+393331234567".
    const cifre = q.replace(/[^\d]/g, '')
    if (cifre.length >= 4) dove.OR.push({ telefono: { contains: cifre } })
  }

  const [
    ordini,
    totale,
    token,
    negoziDb,
    gruppi,
    ultimaSync,
    esitoSync,
    importOrders,
    perTipo,
    consegneOggi,
    consegneDomani,
    scaduteRecenti,
  ] = await Promise.all([
    ordiniOrdinati(dove, ordina, verso, 200),
    db.ordine.count({ where: dove }),
    googleAccessToken().catch(() => null),
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' } }),
    // Conteggio e valore per negozio sull'INTERO filtro: sono le intestazioni
    // delle colonne, non devono fermarsi ai 200 mostrati.
    db.ordine.groupBy({
      by: ['negozioId'],
      where: dove,
      _count: { _all: true },
      _sum: { totale: true },
    }),
    // Quando è passato l'ultimo giro automatico: serve a far vedere che il cron
    // dei 15 minuti sta girando (o che si è fermato).
    db.impostazione.findUnique({ where: { chiave: 'ordiniSyncUltimo' } }),
    // Com'è andato l'ultimo giro: se è fallito bisogna dirlo, altrimenti
    // «aggiornati 3 minuti fa» rassicura mentre in realtà non arriva più niente.
    db.impostazione.findUnique({ where: { chiave: 'ordiniSyncEsito' } }),
    // E quando Orders ha scaricato da Shopify: è l'anello a monte della catena.
    ultimoImportOrders(),
    // Da che tipo di cliente arrivano gli ordini del filtro in corso: è la
    // domanda per cui il campo esiste, quindi la risposta la si dà qui.
    db.ordine.groupBy({ by: ['clienteTipo'], where: dove, _count: { _all: true } }),
    // Quante consegne oggi e domani, e quante scadute da poco: sono i numeri per
    // cui si apre questa pagina, e sul filtro in corso (non sull'archivio).
    db.ordine.count({ where: { AND: [dove, { dataConsegna: { gte: inizioOggi(), lt: inizioDomani() } }] } }),
    db.ordine.count({
      where: {
        AND: [
          dove,
          { dataConsegna: { gte: inizioDomani(), lt: new Date(inizioDomani().getTime() + 86400000) } },
        ],
      },
    }),
    db.ordine.count({
      where: { AND: [dove, { dataConsegna: { gte: limiteCalde(), lt: inizioOggi() } }] },
    }),
  ])

  const statistiche = Object.fromEntries(
    gruppi.map((g) => [g.negozioId, { conteggio: g._count._all, valore: g._sum.totale ?? 0 }])
  )

  const negozi = negoziDb.map((n) => ({
    id: n.id,
    nome: n.nome,
    // il brand serve al bottone "Fornitore" (deep link verso Ricerca fornitori)
    brandRicerca: brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca),
    conteggio: statistiche[n.id]?.conteggio ?? 0,
    valore: statistiche[n.id]?.valore ?? 0,
  }))

  // Quali ordini hanno messaggi: due query per tutta la lista, non una per
  // ordine — con 200 ordini a schermo sarebbero 200 andate e ritorni al
  // database a ogni caricamento della bacheca.
  const messaggiPerOrdine = await ordiniConMessaggi(
    ordini.map((o) => ({ id: o.id, numero: o.numero, email: o.email, telefono: o.telefono }))
  )

  return NextResponse.json({
    // Se quel cliente ci ha scritto, e se aspetta ancora una risposta.
    ordini: ordini.map((o) => ({ ...o, messaggi: messaggiPerOrdine.get(o.id) ?? null })),
    totale, // quanti corrispondono in tutto (la lista è tagliata a 200)
    negozi,
    googleCollegato: !!token,
    ultimaSync: ultimaSync?.valore ?? '',
    // Esito dell'ultimo giro ("ok: 31 ordini…" oppure il messaggio d'errore):
    // un aggiornamento fallito deve vedersi, non nascondersi dietro un orario.
    esitoSync: esitoSync?.valore ?? '',
    // Quando Orders ha scaricato da Shopify: l'anello a monte della catena.
    ultimoImportOrders: importOrders ?? '',
    // { privato: 120, azienda: 8, '': 3 } — '' sono quelli senza tipo noto
    perTipoCliente: Object.fromEntries(perTipo.map((t) => [t.clienteTipo, t._count._all])),
    // I numeri dell'urgenza, sul filtro in corso.
    urgenza: { oggi: consegneOggi, domani: consegneDomani, scaduteRecenti },
  })
}
