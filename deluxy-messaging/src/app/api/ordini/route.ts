import { NextRequest, NextResponse } from 'next/server'
import { ORE_APPENA_ARRIVATO } from '@/lib/cliente-valore'
import { utenteCorrente } from '@/lib/sessione'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'
import { brandRicercaDaNegozio } from '@/lib/negozi'
import { ultimoImportOrders } from '@/lib/orders'
import { ordiniConMessaggi } from '@/lib/messaggi-ordine'
import { chiamateDegliOrdini } from '@/lib/chiamate'
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
//   presa    "miei" | "liberi" (chi se ne sta occupando)
//   nuovi    "si" = solo quelli entrati nelle ultime ORE_APPENA_ARRIVATO ore
// Torna anche se Google è collegato (per abilitare i bottoni "Salva contatto").
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const negozio = (p.get('negozio') ?? '').trim()
  const contatto = (p.get('contatto') ?? '').trim()

  const gestione = (p.get('gestione') ?? '').trim()
  const tipoCliente = (p.get('tipoCliente') ?? '').trim()
  const rimborsi = (p.get('rimborsi') ?? '').trim()
  const presa = (p.get('presa') ?? '').trim()
  const soloNuovi = (p.get('nuovi') ?? '').trim() === 'si'
  // Colonna su cui ordinare. Vuota (o sconosciuta) = l'ordine per urgenza, che
  // resta il modo giusto di guardare la lista di lavoro.
  const ordina = (p.get('ordina') ?? '').trim()
  const verso: 'asc' | 'desc' = (p.get('verso') ?? '') === 'desc' ? 'desc' : 'asc'

  // Chi sta guardando: serve al filtro «miei» e al browser, che senza non
  // saprebbe distinguere «preso da me» da «preso da un collega».
  const io = await utenteCorrente()
  const idUtente = io?.id ?? ''
  // L'elenco degli operatori serve SOLO all'amministratore, che assegna il
  // lavoro: a un operatore non si mandano i nomi dei colleghi per un menu che
  // non può usare.
  const operatori =
    io?.ruolo === 'admin'
      ? await db.utente.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } })
      : []

  const dove: Prisma.OrdineWhereInput = {}
  // ⚠️⚠️ GLI ORDINI UNITI A UN ALTRO NON SONO UNA RIGA A SÉ. Due ordini che sono
  // una vendita sola (acconto e saldo, o un'integrazione) darebbero due righe da
  // lavorare, e chi le prende in mano non sa che sono la stessa torta: uno dei
  // due resterebbe lì per sempre, oppure si telefonerebbe due volte allo stesso
  // fornitore. Si vedono sulla scheda del principale.
  //
  // ⚠️ Ma NELLA RICERCA si trovano lo stesso: chi cerca «1777» quel numero
  // l'ha letto da qualche parte e deve arrivarci.
  if (!q) dove.unitoA = ''
  if (negozio) dove.negozioId = negozio
  // `ignoto` = gli ordini di cui Orders non sa dire il tipo di cliente: sono
  // quelli senza email, telefono né nome, e vale la pena poterli isolare.
  if (tipoCliente === 'ignoto') dove.clienteTipo = ''
  else if (tipoCliente) dove.clienteTipo = tipoCliente
  // ── Di chi è il lavoro ──
  //
  // «Liberi» conta più di «Miei», ed è il motivo per cui esiste il filtro: sono
  // gli ordini che rischiano di non essere lavorati da NESSUNO, perché ognuno
  // dà per scontato che ci pensi un altro. «Miei» è comodo, «Liberi» è il buco.
  if (presa === 'miei') dove.presaDaId = idUtente
  else if (presa === 'liberi') dove.presaDaId = ''

  // ── Solo quelli col bollino NUOVO ──
  //
  // ⚠️ Il filtro sta QUI e non nel browser: la lista è tagliata a 200 e
  // ordinata per urgenza, quindi filtrando a valle si vedrebbero i soli nuovi
  // *fra i 200 già scelti* — e mancherebbero proprio quelli che l'ordinamento
  // ha spinto in fondo. Stessa finestra dell'etichetta (`ORE_APPENA_ARRIVATO`),
  // e stesso campo: `creatoIl` è quando l'ordine è comparso DA NOI, non la data
  // dell'ordine.
  if (soloNuovi) {
    dove.creatoIl = { gte: new Date(Date.now() - ORE_APPENA_ARRIVATO * 3600 * 1000) }
  }

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

  // Riempito dal `catch` qui sotto: il perché Google rifiuta la nostra chiave.
  let erroreGoogle = ''
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
    // Il motivo del rifiuto si tiene da parte invece di buttarlo: senza, la
    // pagina può solo dire «non collegato», che è un vicolo cieco.
    googleAccessToken().catch((e: Error) => {
      erroreGoogle = e.message
      return null
    }),
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
    // Il dominio `xxx.myshopify.com` serve al collegamento verso la scheda
    // dell'ordine dentro Shopify: da lì si ricava la maniglia del negozio. Non
    // è un segreto — sta nello snippet di ogni sito — e senza, il bottone
    // «Apri in Shopify» dovrebbe indovinare su quale dei tre negozi cercare.
    dominio: n.dominio,
    // il brand serve al bottone "Fornitore" (deep link verso Ricerca fornitori)
    brandRicerca: brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca),
    conteggio: statistiche[n.id]?.conteggio ?? 0,
    valore: statistiche[n.id]?.valore ?? 0,
  }))

  // Quali ordini hanno messaggi: due query per tutta la lista, non una per
  // ordine — con 200 ordini a schermo sarebbero 200 andate e ritorni al
  // database a ogni caricamento della bacheca.
  // ── QUALI ORDINI RISULTANO PAGATI ──
  //
  // ⚠️ Segnalato dall'utente: un ordine col pagamento fatto continuava a dire
  // solo «In pagamento». Il fatto («l'abbiamo pagato») vive sulla richiesta di
  // pagamento, e senza portarlo qui la bacheca — che è dove si guarda — non lo
  // sapeva.
  //
  // ⚠️ UNA query per tutta la pagina, non una per ordine.
  // ⚠️ Si porta anche la RICEVUTA: chi guarda la bacheca deve poterla tirare
  // fuori senza passare dalla pagina Pagamenti e cercare la riga giusta. È la
  // prova di un bonifico, e una prova che si raggiunge in tre schermate si
  // finisce per ricaricarla invece di cercarla.
  const pagati = new Map<
    string,
    { quando: Date; quanto: number; ricevutaId: string; ricevutaNome: string }
  >()
  try {
    const righe = await db.richiestaPagamento.findMany({
      where: {
        pagataIl: { not: null },
        ordineNumero: { in: ordini.map((o) => o.numero).filter(Boolean) },
      },
      select: {
        id: true,
        ordineNumero: true,
        pagataIl: true,
        importo: true,
        // ⚠️ Il NOME, non i byte: quelli sono il file in base64, e portarseli
        // dietro per ogni riga della bacheca vorrebbe dire una pagina che non
        // arriva su un telefono.
        ricevutaNome: true,
      },
      orderBy: { pagataIl: 'desc' },
    })
    for (const r of righe) {
      if (!r.pagataIl) continue
      // ⚠️ Il PIÙ RECENTE: di un ordine pagato in due tranche interessa
      // l'ultima, che è quella che dice «da quando è a posto».
      if (!pagati.has(r.ordineNumero)) {
        pagati.set(r.ordineNumero, {
          quando: r.pagataIl,
          quanto: r.importo,
          ricevutaId: r.ricevutaNome ? r.id : '',
          ricevutaNome: r.ricevutaNome,
        })
      }
    }
  } catch {
    // ⚠️ Se questa fallisce la bacheca si apre lo stesso senza i bollini: è un
    // contorno, e una pagina che non si apre è molto peggio.
  }

  // ── LE RICHIESTE DI PAGAMENTO ANCORA APERTE ──
  //
  // ⚠️⚠️ Serve a **spegnere il bottone «Paga fornitore»** su un ordine che ha
  // già una richiesta in piedi. Senza, premerlo una seconda volta apre il
  // modulo vuoto e nasce una richiesta gemella: due righe per lo stesso ordine,
  // due avvisi a chi paga, e nessuno dei due dice che l'altro esiste. È il modo
  // in cui si paga due volte lo stesso fornitore.
  //
  // ⚠️ «Aperta» = **non ancora pagata**. Una già pagata non blocca niente: su un
  // ordine può esserci un secondo fornitore (i fiori e la torta), e vietarlo
  // sarebbe vietare un caso vero.
  const aperti = new Map<string, { id: string; importo: number; a: string }>()
  try {
    const righe = await db.richiestaPagamento.findMany({
      where: {
        pagataIl: null,
        ordineNumero: { in: ordini.map((o) => o.numero).filter(Boolean) },
      },
      select: { id: true, ordineNumero: true, importo: true, intestatario: true },
      orderBy: { creatoIl: 'desc' },
    })
    for (const r of righe) {
      if (!aperti.has(r.ordineNumero)) {
        aperti.set(r.ordineNumero, { id: r.id, importo: r.importo, a: r.intestatario })
      }
    }
  } catch {
    // Come sopra: senza questi bollini la bacheca si apre lo stesso.
  }

  const messaggiPerOrdine = await ordiniConMessaggi(
    ordini.map((o) => ({ id: o.id, numero: o.numero, email: o.email, telefono: o.telefono }))
  )

  // ⚠️⚠️ CHI HA TELEFONATO SI VEDE IN BACHECA, non solo nella sezione Chiamate.
  // Un cliente che chiama per il suo ordine è un'informazione DELL'ORDINE: se
  // sta solo in un altro elenco, chi lavora quell'ordine non la incontra mai —
  // e richiama un'ora dopo per dire una cosa che il cliente aveva già chiesto.
  const chiamatePerOrdine = await chiamateDegliOrdini(ordini.map((o) => ({ id: o.id })))

  return NextResponse.json({
    // Se quel cliente ci ha scritto, e se aspetta ancora una risposta.
    ordini: ordini.map((o) => ({
      ...o,
      messaggi: messaggiPerOrdine.get(o.id) ?? null,
      chiamate: chiamatePerOrdine.get(o.id)
        ? {
            quante: chiamatePerOrdine.get(o.id)!.quante,
            ultima: chiamatePerOrdine.get(o.id)!.ultima.toISOString(),
            daRichiamare: chiamatePerOrdine.get(o.id)!.daRichiamare,
          }
        : null,
      pagatoIl: pagati.get(o.numero)?.quando?.toISOString() ?? null,
      pagatoQuanto: pagati.get(o.numero)?.quanto ?? 0,
      // Vuoto = quel pagamento non ha una ricevuta allegata.
      ricevutaId: pagati.get(o.numero)?.ricevutaId ?? '',
      ricevutaNome: pagati.get(o.numero)?.ricevutaNome ?? '',
      // La richiesta di pagamento ancora aperta su quest'ordine, se c'è: il
      // bottone «Paga fornitore» si spegne e porta a lei.
      pagamentoApertoId: aperti.get(o.numero)?.id ?? '',
      pagamentoApertoQuanto: aperti.get(o.numero)?.importo ?? 0,
      pagamentoApertoA: aperti.get(o.numero)?.a ?? '',
    })),
    totale, // quanti corrispondono in tutto (la lista è tagliata a 200)
    // Chi sta guardando: senza, il bollino «preso da» non saprebbe dire se
    // quell'ordine è mio o di un collega — che è tutta la differenza.
    ioId: idUtente,
    ioRuolo: io?.ruolo ?? '',
    operatori,
    negozi,
    googleCollegato: !!token,
    // ⚠️ Il MOTIVO, non solo il sì/no. `googleAccessToken().catch(() => null)`
    // trasformava «Google ha revocato l'accesso» in un muto «non collegato», e
    // chi lo leggeva andava in Impostazioni — dove per giunta c'era scritto
    // «collegato», perché lì si guardava solo se la chiave era salvata.
    googleErrore: erroreGoogle,
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
