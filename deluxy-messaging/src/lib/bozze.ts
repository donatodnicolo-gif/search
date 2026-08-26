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
  /** I negozi a cui non si è potuto chiedere: si dice, non si tace. */
  nonChiesti: string[]
}

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
export async function elencoBozze(giorni = 60): Promise<ElencoBozze> {
  const dal = new Date(Date.now() - giorni * 86400000)
  const righe = await db.ordineCreato.findMany({
    where: { pagamento: 'link', creatoIl: { gte: dal }, NOT: { bozzaId: '' } },
    orderBy: { creatoIl: 'desc' },
    take: 200,
  })
  if (righe.length === 0) {
    return { bozze: [], aperte: 0, pagate: 0, valoreInSospeso: 0, nonChiesti: [] }
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
    nonChiesti: [...new Set(nonChiesti)],
  }
}
