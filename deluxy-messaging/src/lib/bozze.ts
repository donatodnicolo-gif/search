// LE BOZZE MANDATE: sono state pagate o no?
//
// Ogni «Nuovo ordine» col link di pagamento crea una BOZZA su Shopify e ne
// lascia una riga qui (`OrdineCreato`). Fin qui si sapeva chi l'aveva fatta e
// per quanto — ma non **com'è finita**: per scoprirlo bisognava aprire Shopify,
// negozio per negozio, e cercarla a mano. Così nessuno lo faceva, e i link
// mandati e mai pagati sparivano dal pensiero di tutti.
//
// ⚠️⚠️ LO STATO NON È NOSTRO: la bozza vive su Shopify, e l'unico che sa se è
// stata pagata è Shopify. Qui non si tiene una copia dello stato — si CHIEDE
// quando si apre la pagina. L'unica cosa che si scrive è il numero dell'ordine
// nato dalla bozza, e solo perché quel fatto **non torna più indietro**: una
// bozza completata resta completata, e riscriverlo ogni volta sarebbe chiedere
// due volte la stessa risposta.
//
// ⚠️ Se Shopify non risponde per un negozio, quelle bozze tornano con stato
// «non chiesto» e la pagina lo dice. Non «aperte»: dedurre lo stato dal
// silenzio è il modo di dichiarare non pagata una bozza incassata.

import { db } from './db'
import { decifra } from './crypto'
import { leggiImpostazioni } from './impostazioni'

const VERSIONE = '2025-01'

type NegozioAuth = {
  id: string
  nome: string
  dominio: string
  clientId: string
  clientSecret: string
}

async function token(n: NegozioAuth): Promise<string> {
  if (!n.clientId || !n.clientSecret) return ''
  try {
    const res = await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: n.clientId,
        client_secret: decifra(n.clientSecret),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const j = (await res.json().catch(() => ({}))) as { access_token?: string }
    return j.access_token ?? ''
  } catch {
    return ''
  }
}

const QUERY = `query bozze($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on DraftOrder {
      id
      name
      status
      invoiceUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      order { id name }
    }
  }
}`

type NodoBozza = {
  id: string
  name: string
  status: string
  invoiceUrl: string | null
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } }
  order?: { id: string; name: string } | null
} | null

export type StatoBozza = 'pagata' | 'aperta' | 'invito_inviato' | 'sparita' | 'non_chiesto'

export type BozzaDto = {
  id: string
  bozzaNome: string
  negozioNome: string
  clienteNome: string
  clienteEmail: string
  importo: number
  valuta: string
  utenteNome: string
  creatoIl: string
  invitoInviato: boolean
  stato: StatoBozza
  /** Il numero dell'ordine nato dalla bozza, quando è stata pagata. */
  ordineNumero: string
  /** Il link di pagamento, riletto da Shopify: serve a rimandarlo. */
  link: string
  /** Da quanti giorni è in giro senza essere pagata. */
  giorni: number
}

export type ElencoBozze = {
  bozze: BozzaDto[]
  aperte: number
  pagate: number
  valoreInSospeso: number
  /** Quante ne sono state annullate perché scadute: non spariscono, si contano. */
  annullate: number
  /** I negozi a cui non si è potuto chiedere: si dice, non si tace. */
  nonChiesti: string[]
}

/**
 * Dopo quanti giorni una bozza non pagata si annulla.
 *
 * ⚠️ Sta in Impostazioni (`giorniBozzaScaduta`) e non nel codice: è una regola
 * commerciale — «per quanto tiene il prezzo» — e cambiarla non deve richiedere
 * un rilascio. Vuoto o non valido = 7.
 */
export const GIORNI_SCADENZA_DEFAULT = 7

function giorniDa(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
}

/**
 * Le bozze create da qui negli ultimi `giorni`, con lo stato chiesto a Shopify.
 *
 * ⚠️ Solo quelle col link (`pagamento: 'link'`): una chiusa subito come «pagata»
 * è già un ordine, e metterla in un elenco di cose in sospeso vorrebbe dire
 * chiedere a qualcuno di controllare una cosa finita.
 */
export async function elencoBozze(
  giorni = 60,
  opzioni?: { annullate?: boolean }
): Promise<ElencoBozze> {
  const dal = new Date(Date.now() - giorni * 86400000)
  const soloAnnullate = opzioni?.annullate === true

  // ⚠️⚠️ LE ANNULLATE NON STANNO IN «TUTTE» (chiesto dall'utente). Una bozza
  // scaduta e cancellata su Shopify non è più una cosa da fare: lasciarla in
  // mezzo alle altre vorrebbe dire far ricontrollare ogni giorno una fila che
  // cresce e non si smaltisce mai. Restano raggiungibili dal loro filtro —
  // toglierle dalla vista non è cancellarle.
  const annullate = await db.ordineCreato.count({
    where: { pagamento: 'link', creatoIl: { gte: dal }, annullataIl: { not: null } },
  })

  const righe = await db.ordineCreato.findMany({
    where: {
      pagamento: 'link',
      creatoIl: { gte: dal },
      // ⚠️ `bozzaId: { not: '' }` e non un secondo `NOT:` accanto al primo: due
      // chiavi `NOT` nello stesso oggetto e la seconda sovrascrive la prima —
      // in silenzio per Prisma, e il filtro sparisce.
      bozzaId: { not: '' },
      ...(soloAnnullate ? { annullataIl: { not: null } } : { annullataIl: null }),
    },
    orderBy: { creatoIl: 'desc' },
    take: 200,
  })
  if (righe.length === 0) {
    return { bozze: [], aperte: 0, pagate: 0, valoreInSospeso: 0, annullate, nonChiesti: [] }
  }

  const negozi = await db.negozioShopify.findMany({
    where: { id: { in: [...new Set(righe.map((r) => r.negozioId).filter(Boolean))] } },
    select: { id: true, nome: true, dominio: true, clientId: true, clientSecret: true },
  })

  const stato = new Map<string, NodoBozza>()
  const nonChiesti: string[] = []

  for (const n of negozi) {
    const sue = righe.filter((r) => r.negozioId === n.id)
    // ⚠️ Quelle che sappiamo già pagate non si richiedono: il numero dell'ordine
    // è scritto, e una bozza completata non torna indietro.
    const daChiedere = sue.filter((r) => !r.ordineNumero).map((r) => r.bozzaId)
    if (daChiedere.length === 0) continue

    const t = await token(n)
    if (!t) {
      nonChiesti.push(n.nome)
      continue
    }
    try {
      const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
        // ⚠️ A blocchi di 100: `nodes` ha un tetto, e una lista più lunga
        // tornerebbe un errore che sembra «bozze non trovate».
        body: JSON.stringify({ query: QUERY, variables: { ids: daChiedere.slice(0, 100) } }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      })
      const j = (await res.json().catch(() => ({}))) as { data?: { nodes?: NodoBozza[] } }
      const nodi = j.data?.nodes ?? []
      if (!res.ok || !j.data) {
        nonChiesti.push(n.nome)
        continue
      }
      for (let i = 0; i < daChiedere.length && i < nodi.length; i++) {
        stato.set(daChiedere[i], nodi[i])
      }
    } catch {
      nonChiesti.push(n.nome)
    }
  }

  // ⚠️ Il numero dell'ordine si SCRIVE quando si scopre: è un fatto definitivo,
  // e senza scriverlo ogni apertura della pagina rifarebbe la stessa domanda a
  // Shopify per sempre.
  for (const r of righe) {
    const n = stato.get(r.bozzaId)
    if (n?.order?.name && !r.ordineNumero) {
      await db.ordineCreato
        .update({ where: { id: r.id }, data: { ordineNumero: n.order.name } })
        .catch(() => {})
      r.ordineNumero = n.order.name
    }
  }

  const bozze: BozzaDto[] = righe.map((r) => {
    const n = stato.get(r.bozzaId)
    let s: StatoBozza
    if (r.ordineNumero) s = 'pagata'
    else if (!n && !stato.has(r.bozzaId)) s = 'non_chiesto'
    else if (!n) s = 'sparita'
    else if (n.status === 'COMPLETED') s = 'pagata'
    else if (n.status === 'INVOICE_SENT') s = 'invito_inviato'
    else s = 'aperta'
    return {
      id: r.id,
      bozzaNome: r.bozzaNome,
      negozioNome: r.negozioNome,
      clienteNome: r.clienteNome,
      clienteEmail: r.clienteEmail,
      importo: r.importo,
      valuta: r.valuta,
      utenteNome: r.utenteNome,
      creatoIl: r.creatoIl.toISOString(),
      invitoInviato: r.invitoInviato,
      stato: s,
      ordineNumero: r.ordineNumero,
      link: n?.invoiceUrl ?? '',
      giorni: giorniDa(r.creatoIl),
    }
  })

  return {
    bozze,
    aperte: bozze.filter((b) => b.stato === 'aperta' || b.stato === 'invito_inviato').length,
    pagate: bozze.filter((b) => b.stato === 'pagata').length,
    valoreInSospeso: bozze
      .filter((b) => b.stato === 'aperta' || b.stato === 'invito_inviato')
      .reduce((s, b) => s + b.importo, 0),
    annullate,
    nonChiesti: [...new Set(nonChiesti)],
  }
}

// ── ANNULLARE LE BOZZE SCADUTE ───────────────────────────────────────────────
//
// ⚠️⚠️ Questo pezzo CANCELLA per davvero, e fuori da casa nostra: la bozza
// sparisce da Shopify e il link smette di funzionare. Per questo:
//   · si toccano SOLO le bozze create da qui col link di pagamento;
//   · SOLO quelle più vecchie del limite (7 giorni di default);
//   · e solo dopo aver CHIESTO a Shopify come stanno. Una bozza pagata non si
//     cancella mai — a quel punto è un ordine, e cancellarla sarebbe cancellare
//     una vendita.
// ⚠️ Se Shopify non risponde non si annulla niente: «non lo so» non è «scaduta».

const MUTAZIONE_ELIMINA = `mutation elimina($input: DraftOrderDeleteInput!) {
  draftOrderDelete(input: $input) {
    deletedId
    userErrors { field message }
  }
}`

export type EsitoAnnullamento = {
  guardate: number
  annullate: number
  saltate: number
  errori: string[]
}

export async function annullaBozzeScadute(giorniLimite?: number): Promise<EsitoAnnullamento> {
  const conf = await leggiImpostazioni(['giorniBozzaScaduta'])
  const daImpostazioni = Number(conf.giorniBozzaScaduta)
  const limite =
    giorniLimite && giorniLimite > 0
      ? giorniLimite
      : Number.isFinite(daImpostazioni) && daImpostazioni > 0
        ? daImpostazioni
        : GIORNI_SCADENZA_DEFAULT

  const scadute = new Date(Date.now() - limite * 86400000)
  const righe = await db.ordineCreato.findMany({
    where: {
      pagamento: 'link',
      annullataIl: null,
      // ⚠️ Quelle che sappiamo già diventate ordini non si toccano nemmeno per
      // sbaglio: `ordineNumero` scritto vuol dire pagata.
      ordineNumero: '',
      creatoIl: { lt: scadute },
      bozzaId: { not: '' },
    },
    take: 100,
  })
  const esito: EsitoAnnullamento = { guardate: righe.length, annullate: 0, saltate: 0, errori: [] }
  if (righe.length === 0) return esito

  const negozi = await db.negozioShopify.findMany({
    where: { id: { in: [...new Set(righe.map((r) => r.negozioId).filter(Boolean))] } },
    select: { id: true, nome: true, dominio: true, clientId: true, clientSecret: true },
  })

  for (const n of negozi) {
    const sue = righe.filter((r) => r.negozioId === n.id)
    if (sue.length === 0) continue
    const t = await token(n)
    if (!t) {
      esito.errori.push(`${n.nome}: nessun token, non annullo niente`)
      esito.saltate += sue.length
      continue
    }

    // Prima si CHIEDE, poi si cancella: lo stato è di Shopify.
    let stati = new Map<string, NodoBozza>()
    try {
      const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
        body: JSON.stringify({ query: QUERY, variables: { ids: sue.map((r) => r.bozzaId) } }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      })
      const j = (await res.json().catch(() => ({}))) as { data?: { nodes?: NodoBozza[] } }
      if (!res.ok || !j.data) throw new Error(`Shopify ha risposto ${res.status}`)
      stati = new Map(sue.map((r, i) => [r.bozzaId, (j.data?.nodes ?? [])[i] ?? null]))
    } catch (e) {
      esito.errori.push(`${n.nome}: ${(e as Error).message}`)
      esito.saltate += sue.length
      continue
    }

    for (const r of sue) {
      const nodo = stati.get(r.bozzaId)

      // Pagata nel frattempo: si registra l'ordine e si lascia stare.
      if (nodo?.order?.name || nodo?.status === 'COMPLETED') {
        await db.ordineCreato
          .update({
            where: { id: r.id },
            data: { ordineNumero: nodo.order?.name ?? r.ordineNumero },
          })
          .catch(() => {})
        esito.saltate++
        continue
      }

      // Non c'è più su Shopify: niente da cancellare, ma la riga va chiusa —
      // altrimenti resta a chiedere lo stato di una bozza che non esiste.
      if (!nodo) {
        await db.ordineCreato
          .update({
            where: { id: r.id },
            data: {
              annullataIl: new Date(),
              annullataDaNome: 'automatico',
              annullataMotivo: `Non era più su Shopify dopo ${limite} giorni`,
            },
          })
          .catch(() => {})
        esito.annullate++
        continue
      }

      try {
        const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE}/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
          body: JSON.stringify({
            query: MUTAZIONE_ELIMINA,
            variables: { input: { id: r.bozzaId } },
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        })
        const j = (await res.json().catch(() => ({}))) as {
          data?: { draftOrderDelete?: { deletedId?: string; userErrors?: { message: string }[] } }
        }
        const errori = j.data?.draftOrderDelete?.userErrors ?? []
        if (!res.ok || errori.length > 0) {
          // ⚠️ Se la cancellazione fallisce NON si segna annullata: resterebbe
          // in giro un link pagabile che qui risulta chiuso.
          esito.errori.push(`${r.bozzaNome}: ${errori[0]?.message ?? `HTTP ${res.status}`}`)
          esito.saltate++
          continue
        }
        await db.ordineCreato.update({
          where: { id: r.id },
          data: {
            annullataIl: new Date(),
            annullataDaNome: 'automatico',
            annullataMotivo: `Non pagata dopo ${limite} giorni`,
          },
        })
        esito.annullate++
      } catch (e) {
        esito.errori.push(`${r.bozzaNome}: ${(e as Error).message}`)
        esito.saltate++
      }
    }
  }

  return esito
}
