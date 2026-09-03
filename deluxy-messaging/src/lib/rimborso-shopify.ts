import { db } from '@/lib/db'
import { graphqlNegozio, negozioConToken } from '@/lib/shopify-negozio'

// ── IL RIMBORSO VERO, QUELLO CHE MUOVE I SOLDI ──
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026: «ok puoi in caso approvato far
// partire il rimborso?». Fino a ieri qui non usciva un centesimo: la pagina
// Rimborsi registrava la decisione e i soldi li rendeva una persona da
// Shopify. Adesso, **solo da una richiesta già APPROVATA**, il rimborso parte.
//
// ⚠️ È l'unico punto di tutte le app di Customer Service che fa uscire denaro.
// Per questo:
//   · parte solo da `approvato` (l'approvazione resta un atto separato, di una
//     persona diversa da chi ha chiesto);
//   · la riga si «prende» con una scrittura condizionata PRIMA di chiamare
//     Shopify — due clic ravvicinati non possono rimborsare due volte;
//   · l'importo si ricontrolla su Shopify, non sul nostro numero: `netPayment`
//     è quanto resta davvero da rendere (pagato meno già rimborsato), e un
//     ordine può essere stato rimborsato altrove mentre la richiesta dormiva;
//   · l'errore di Shopify si mostra parola per parola, senza tradurlo in un
//     «non riuscito» che nasconde il motivo.

export type EsitoRimborsoShopify =
  | { stato: 'ok'; refundId: string; importo: number; totaleRimborsato: number }
  /** L'ordine non vive qui (archivio di Orders): da qui non si può rimborsare. */
  | { stato: 'senza-ordine'; messaggio: string }
  /** L'ordine è in una valuta diversa da quella del negozio. */
  | { stato: 'valuta'; messaggio: string }
  /** Più di quanto Shopify può ancora rendere. */
  | { stato: 'troppo'; messaggio: string }
  | { stato: 'errore'; messaggio: string }

type Transazione = {
  id: string
  kind: string
  status: string
  gateway: string
  amountSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
  parentTransaction?: { id: string } | null
}

const QUERY_ORDINE = `query Ordine($id: ID!) {
  order(id: $id) {
    id
    name
    currencyCode
    presentmentCurrencyCode
    netPaymentSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount } }
    transactions(first: 30) {
      id
      kind
      status
      gateway
      amountSet { shopMoney { amount currencyCode } }
      parentTransaction { id }
    }
  }
}`

const MUTAZIONE = `mutation Rimborsa($input: RefundInput!) {
  refundCreate(input: $input) {
    refund {
      id
      createdAt
      totalRefundedSet { shopMoney { amount currencyCode } }
    }
    userErrors { field message }
  }
}`

function euro(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

/** In centesimi interi: i confronti sui soldi non si fanno sui float. */
function cent(v: number): number {
  return Math.round(v * 100)
}

/**
 * Rende `importo` sull'ordine, davvero, sul metodo con cui il cliente ha pagato.
 *
 * ⚠️ Non decide NIENTE: chi la chiama ha già controllato stato, permessi e
 * tetto. Qui si parla con Shopify e si riporta cosa ha risposto.
 */
export type Preparato = {
  stato: 'ok'
  ordineNome: string
  restante: number
  valuta: string
  shopifyId: string
  negozioId: string
  transazioni: { orderId: string; parentId: string; gateway: string; kind: string; amount: string }[]
}

/**
 * Tutto quello che serve al rimborso, SENZA farlo: legge l ordine, controlla
 * valuta e tetto, e decide su quali incassi si rende.
 *
 * ⚠️ Sta separata apposta: cosi si puo provare su un ordine vero — e si prova —
 * senza far uscire un euro. Una funzione che si puo verificare solo spendendo
 * non la verifica nessuno.
 */
export async function preparaRimborso(opzioni: {
  ordineId: string
  importo: number
}): Promise<Preparato | Exclude<EsitoRimborsoShopify, { stato: 'ok' }>> {
  const { ordineId, importo } = opzioni
  if (!Number.isFinite(importo) || cent(importo) <= 0) {
    return { stato: 'errore', messaggio: 'Importo del rimborso non valido.' }
  }

  const ordine = ordineId
    ? await db.ordine.findUnique({
        where: { id: ordineId },
        select: { id: true, numero: true, negozioId: true, negozioNome: true, shopifyId: true },
      })
    : null
  // ⚠️ Una richiesta può nascere da un ordine che sta solo nell'archivio di
  // Deluxy Orders: lì il gid Shopify non ce l'abbiamo, e senza quello non c'è
  // niente da rimborsare. Si dice, invece di fallire con un errore tecnico.
  if (!ordine || !ordine.shopifyId.startsWith('gid://')) {
    return {
      stato: 'senza-ordine',
      messaggio:
        'Di questo ordine non abbiamo il riferimento Shopify (arriva dall’archivio di Orders): il rimborso va fatto da Shopify e poi segnato qui.',
    }
  }

  const accesso = await negozioConToken(ordine.negozioId)
  if (!accesso) {
    return { stato: 'errore', messaggio: 'Shopify non ha dato un token per questo negozio.' }
  }

  const letto = await graphqlNegozio<{
    errors?: { message: string }[]
    data?: {
      order?: {
        name?: string
        currencyCode?: string
        presentmentCurrencyCode?: string
        netPaymentSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
        totalRefundedSet?: { shopMoney?: { amount?: string } | null } | null
        transactions?: Transazione[]
      } | null
    }
  }>(accesso.negozio, accesso.token, QUERY_ORDINE, { id: ordine.shopifyId })

  if (letto.errors?.[0]) return { stato: 'errore', messaggio: letto.errors[0].message }
  const o = letto.data?.order
  if (!o) return { stato: 'errore', messaggio: 'Shopify non trova questo ordine.' }

  // ⚠️ Valuta di presentazione diversa da quella del negozio: l'importo che
  // Shopify vuole non è quello che abbiamo noi, e sbagliarlo vuol dire rendere
  // la cifra sbagliata a una persona vera. Meglio fermarsi e dirlo.
  if (o.presentmentCurrencyCode && o.currencyCode && o.presentmentCurrencyCode !== o.currencyCode) {
    return {
      stato: 'valuta',
      messaggio: `L’ordine ${o.name} è stato pagato in ${o.presentmentCurrencyCode} mentre il negozio incassa in ${o.currencyCode}: questo rimborso va fatto da Shopify.`,
    }
  }

  // Quanto Shopify può ANCORA rendere: pagato meno già rimborsato. È il numero
  // che conta, e non è il nostro: l'ordine può essere stato rimborsato altrove
  // mentre la richiesta aspettava.
  const restante = Number(o.netPaymentSet?.shopMoney?.amount ?? '0') || 0
  if (cent(importo) > cent(restante)) {
    const gia = Number(o.totalRefundedSet?.shopMoney?.amount ?? '0') || 0
    return {
      stato: 'troppo',
      messaggio: `Su ${o.name} si può ancora rendere ${euro(restante)}${
        gia > 0 ? ` (${euro(gia)} risultano già rimborsati)` : ''
      }: il rimborso di ${euro(importo)} non parte.`,
    }
  }

  // ── Su quale incasso si rende ──
  //
  // ⚠️⚠️ Senza `transactions` Shopify registra un rimborso CONTABILE e non
  // muove un euro: sembrerebbe fatto, e il cliente non riceverebbe niente. Il
  // rimborso va agganciato alla transazione con cui ha pagato (`parentId` +
  // `gateway`), e quella transazione può essere già stata rimborsata in parte:
  // il residuo si calcola togliendo i REFUND che le pendono sotto.
  const tutte = o.transactions ?? []
  const resi = new Map<string, number>()
  for (const t of tutte) {
    if (t.kind !== 'REFUND') continue
    if (t.status !== 'SUCCESS' && t.status !== 'PENDING') continue
    const padre = t.parentTransaction?.id
    if (!padre) continue
    resi.set(padre, (resi.get(padre) ?? 0) + (Number(t.amountSet?.shopMoney?.amount ?? '0') || 0))
  }
  const incassi = tutte
    .filter((t) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS')
    .map((t) => ({
      id: t.id,
      gateway: t.gateway,
      residuo: (Number(t.amountSet?.shopMoney?.amount ?? '0') || 0) - (resi.get(t.id) ?? 0),
    }))
    .filter((t) => cent(t.residuo) > 0)
    // Dal più capiente: così un rimborso si spezza sul minor numero di incassi.
    .sort((a, b) => b.residuo - a.residuo)

  const disponibile = incassi.reduce((s, t) => s + t.residuo, 0)
  if (cent(disponibile) < cent(importo)) {
    return {
      stato: 'troppo',
      messaggio: `Gli incassi rimborsabili di ${o.name} coprono ${euro(disponibile)}: il rimborso di ${euro(importo)} non parte.`,
    }
  }

  const valuta = o.netPaymentSet?.shopMoney?.currencyCode || o.currencyCode || 'EUR'
  const transazioni: { orderId: string; parentId: string; gateway: string; kind: string; amount: string }[] = []
  let daCoprire = cent(importo)
  for (const t of incassi) {
    if (daCoprire <= 0) break
    const quota = Math.min(daCoprire, cent(t.residuo))
    transazioni.push({
      orderId: ordine.shopifyId,
      parentId: t.id,
      gateway: t.gateway,
      kind: 'REFUND',
      amount: (quota / 100).toFixed(2),
    })
    daCoprire -= quota
  }

  return {
    stato: 'ok',
    ordineNome: o.name ?? ordine.numero,
    restante,
    valuta,
    shopifyId: ordine.shopifyId,
    negozioId: ordine.negozioId,
    transazioni,
  }
}

/**
 * Rende `importo` sull'ordine, davvero, sul metodo con cui il cliente ha pagato.
 *
 * ⚠️ Non decide NIENTE: chi la chiama ha già controllato stato e permessi. Qui
 * si prepara (con tutti i controlli), si parla con Shopify e si riporta cosa ha
 * risposto — parola per parola.
 */
export async function rimborsaSuShopify(opzioni: {
  ordineId: string
  importo: number
  nota: string
  /** Se Shopify deve mandare al cliente la sua email di rimborso. */
  avvisaCliente: boolean
}): Promise<EsitoRimborsoShopify> {
  const pronto = await preparaRimborso({ ordineId: opzioni.ordineId, importo: opzioni.importo })
  if (!('transazioni' in pronto)) return pronto

  const accesso = await negozioConToken(pronto.negozioId)
  if (!accesso) {
    return { stato: 'errore', messaggio: 'Shopify non ha dato un token per questo negozio.' }
  }

  const fatto = await graphqlNegozio<{
    errors?: { message: string }[]
    data?: {
      refundCreate?: {
        refund?: { id: string; totalRefundedSet?: { shopMoney?: { amount?: string } | null } | null } | null
        userErrors?: { field: string[]; message: string }[]
      }
    }
  }>(accesso.negozio, accesso.token, MUTAZIONE, {
    input: {
      orderId: pronto.shopifyId,
      note: opzioni.nota.slice(0, 500),
      // ⚠️ Di suo NON si scrive al cliente: l'email di rimborso di Shopify è
      // col tono del negozio, e da noi il cliente ha già una persona che gli
      // sta parlando. Si accende con la spunta, per chi la vuole.
      notify: Boolean(opzioni.avvisaCliente),
      currency: pronto.valuta,
      // Si rende un IMPORTO, non delle righe: per Shopify è una differenza fra
      // il calcolato e il reso, e va dichiarato il perché o rifiuta.
      discrepancyReason: 'CUSTOMER',
      transactions: pronto.transazioni,
    },
  })

  const erroreDuro = fatto.errors?.[0]?.message
  const erroreUtente = fatto.data?.refundCreate?.userErrors?.[0]?.message
  if (erroreDuro || erroreUtente) {
    return { stato: 'errore', messaggio: erroreUtente || erroreDuro || 'Rimborso non riuscito.' }
  }
  const refund = fatto.data?.refundCreate?.refund
  if (!refund?.id) {
    return {
      stato: 'errore',
      messaggio: 'Shopify non ha restituito il rimborso: controlla sull’ordine prima di riprovare.',
    }
  }
  return {
    stato: 'ok',
    refundId: refund.id,
    importo: opzioni.importo,
    totaleRimborsato: Number(refund.totalRefundedSet?.shopMoney?.amount ?? '0') || 0,
  }
}