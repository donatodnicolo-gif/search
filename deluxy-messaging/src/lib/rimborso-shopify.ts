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
  | {
      stato: 'ok'
      refundId: string
      /** Nei nostri soldi (valuta del negozio). */
      importo: number
      /** Quello che riceve il cliente, nella valuta con cui ha pagato. */
      importoCliente: number
      valutaCliente: string
      totaleRimborsato: number
    }
  /** L'ordine non vive qui (archivio di Orders): da qui non si può rimborsare. */
  | { stato: 'senza-ordine'; messaggio: string }
  /**
   * L'ordine è in valuta straniera e Shopify non dice quanto vale nella valuta
   * del cliente: senza quel numero non si rende niente.
   * ⚠️ Fino all'11/09/2026 qui finiva OGNI ordine estero: vedi il blocco
   * «IL CLIENTE HA PAGATO IN DOLLARI» più sotto.
   */
  | { stato: 'valuta'; messaggio: string }
  /** Più di quanto Shopify può ancora rendere. */
  | { stato: 'troppo'; messaggio: string }
  | { stato: 'errore'; messaggio: string }

type Soldi = { amount?: string; currencyCode?: string } | null
type Coppia = { shopMoney?: Soldi; presentmentMoney?: Soldi } | null

type Transazione = {
  id: string
  kind: string
  status: string
  gateway: string
  amountSet?: Coppia
  parentTransaction?: { id: string } | null
}

/** Il numero dentro un `...Money`, o zero. */
function n(s: Soldi | undefined): number {
  return Number(s?.amount ?? '0') || 0
}

// ⚠️⚠️ Ogni cifra si chiede DUE volte: `shopMoney` è quello che vede il
// negozio (euro: i nostri numeri, il nostro tetto), `presentmentMoney` è
// quello che ha pagato il cliente (dollari, sterline…). Su un ordine estero i
// due non coincidono, e il rimborso Shopify lo vuole nella valuta del cliente.
const QUERY_ORDINE = `query Ordine($id: ID!) {
  order(id: $id) {
    id
    name
    currencyCode
    presentmentCurrencyCode
    netPaymentSet {
      shopMoney { amount currencyCode }
      presentmentMoney { amount currencyCode }
    }
    totalRefundedSet { shopMoney { amount } }
    transactions(first: 30) {
      id
      kind
      status
      gateway
      amountSet {
        shopMoney { amount currencyCode }
        presentmentMoney { amount currencyCode }
      }
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

/** Come euro(), ma nella valuta che ha usato davvero il cliente. */
function inValuta(v: number, valuta: string): string {
  try {
    return v.toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' })
  } catch {
    return `${v.toFixed(2)} ${valuta}`
  }
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
  /** Quanto Shopify può ancora rendere, nei NOSTRI soldi (valuta del negozio). */
  restante: number
  /** La valuta del negozio: quella dei numeri che si vedono nell'app. */
  valuta: string
  /**
   * ⭐ 11/09/2026 — Quanto riceve DAVVERO il cliente, nella valuta con cui ha
   * pagato. Su un ordine italiano è lo stesso numero di sopra; su #2846 sono
   * 160,00 $ contro i 138,20 € che vediamo noi.
   */
  importoCliente: number
  valutaCliente: string
  /** Il cliente ha pagato in una valuta diversa dalla nostra. */
  conversione: boolean
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
        netPaymentSet?: Coppia
        totalRefundedSet?: Coppia
        transactions?: Transazione[]
      } | null
    }
  }>(accesso.negozio, accesso.token, QUERY_ORDINE, { id: ordine.shopifyId })

  if (letto.errors?.[0]) return { stato: 'errore', messaggio: letto.errors[0].message }
  const o = letto.data?.order
  if (!o) return { stato: 'errore', messaggio: 'Shopify non trova questo ordine.' }

  // ── IL CLIENTE HA PAGATO IN DOLLARI ──
  //
  // ⚠️⚠️ 11/09/2026, dopo il «non si può superare questo problema?»
  // dell'utente sull'ordine #2846. Fino a stamattina un ordine in valuta
  // straniera si fermava qui con «va fatto da Shopify»: una porta chiusa, e
  // qualcuno doveva andare a mano nell'admin. Il motivo del blocco però era
  // giusto — Shopify il rimborso lo vuole nella valuta del CLIENTE, e mandargli
  // il nostro numero in euro vorrebbe dire rendere 138,20 $ invece di 160,00 $.
  //
  // La strada è dire a Shopify il numero giusto, non rinunciare:
  //   · ogni cifra si legge due volte (`shopMoney` per noi, `presentmentMoney`
  //     per il cliente) e il rimborso si dichiara nella valuta del cliente;
  //   · il TETTO resta nei nostri soldi, che sono quelli su cui si è deciso;
  //   · se si rende tutto il residuo, la cifra del cliente NON si converte: si
  //     prende quella che Shopify ha già scritto — zero arrotondamenti;
  //   · se si rende una parte, si usa il cambio DI QUESTO ORDINE (il rapporto
  //     fra i due importi che Shopify ha registrato quel giorno), mai un cambio
  //     di mercato preso altrove.
  //
  // ⚠️ Resta un paletto: senza i numeri in valuta del cliente non si prova a
  // indovinare. Meglio la porta chiusa di un rimborso sbagliato a una persona.
  const valutaCliente = o.presentmentCurrencyCode || o.currencyCode || 'EUR'
  const valuta = o.netPaymentSet?.shopMoney?.currencyCode || o.currencyCode || 'EUR'
  const conversione = valutaCliente !== valuta

  // Quanto Shopify può ANCORA rendere: pagato meno già rimborsato. È il numero
  // che conta, e non è il nostro: l'ordine può essere stato rimborsato altrove
  // mentre la richiesta aspettava.
  const restante = n(o.netPaymentSet?.shopMoney)
  const restanteCliente = n(o.netPaymentSet?.presentmentMoney)
  if (cent(importo) > cent(restante)) {
    const gia = n(o.totalRefundedSet?.shopMoney)
    return {
      stato: 'troppo',
      messaggio: `Su ${o.name} si può ancora rendere ${euro(restante)}${
        gia > 0 ? ` (${euro(gia)} risultano già rimborsati)` : ''
      }: il rimborso di ${euro(importo)} non parte.`,
    }
  }
  if (conversione && cent(restanteCliente) <= 0) {
    return {
      stato: 'valuta',
      messaggio: `L’ordine ${o.name} è stato pagato in ${valutaCliente} ma Shopify non dice quanto resta da rendere in ${valutaCliente}: questo rimborso va fatto dall’admin di Shopify.`,
    }
  }

  // Quanto riceve il cliente. Tutto il residuo → la cifra di Shopify così
  // com'è; una parte → in proporzione, col cambio di questo ordine.
  const importoCliente = !conversione
    ? importo
    : cent(importo) >= cent(restante)
      ? restanteCliente
      : Math.round((cent(importo) * cent(restanteCliente)) / cent(restante)) / 100

  // ── Su quale incasso si rende ──
  //
  // ⚠️⚠️ Senza `transactions` Shopify registra un rimborso CONTABILE e non
  // muove un euro: sembrerebbe fatto, e il cliente non riceverebbe niente. Il
  // rimborso va agganciato alla transazione con cui ha pagato (`parentId` +
  // `gateway`), e quella transazione può essere già stata rimborsata in parte:
  // il residuo si calcola togliendo i REFUND che le pendono sotto.
  // ⚠️ I residui si tengono in DUE valute: quella del cliente è quella con cui
  // si parla a Shopify, quella del negozio serve a scrivere messaggi che
  // l'operatore riconosce.
  const tutte = o.transactions ?? []
  const resi = new Map<string, { nostri: number; cliente: number }>()
  for (const t of tutte) {
    if (t.kind !== 'REFUND') continue
    if (t.status !== 'SUCCESS' && t.status !== 'PENDING') continue
    const padre = t.parentTransaction?.id
    if (!padre) continue
    const prima = resi.get(padre) ?? { nostri: 0, cliente: 0 }
    resi.set(padre, {
      nostri: prima.nostri + n(t.amountSet?.shopMoney),
      cliente: prima.cliente + n(t.amountSet?.presentmentMoney),
    })
  }
  const incassi = tutte
    .filter((t) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS')
    .map((t) => {
      const reso = resi.get(t.id) ?? { nostri: 0, cliente: 0 }
      return {
        id: t.id,
        gateway: t.gateway,
        residuo: n(t.amountSet?.shopMoney) - reso.nostri,
        residuoCliente: n(t.amountSet?.presentmentMoney) - reso.cliente,
      }
    })
    .filter((t) => cent(t.residuo) > 0 && cent(t.residuoCliente) > 0)
    // Dal più capiente: così un rimborso si spezza sul minor numero di incassi.
    .sort((a, b) => b.residuo - a.residuo)

  const disponibile = incassi.reduce((s, t) => s + t.residuo, 0)
  if (cent(disponibile) < cent(importo)) {
    return {
      stato: 'troppo',
      messaggio: `Gli incassi rimborsabili di ${o.name} coprono ${euro(disponibile)}: il rimborso di ${euro(importo)} non parte.`,
    }
  }
  const disponibileCliente = incassi.reduce((s, t) => s + t.residuoCliente, 0)
  // ⚠️ Due centesimi di tolleranza: il cambio arrotonda, e un rimborso non
  // deve fallire per un cent. Oltre, è un vero «non ci stanno».
  if (cent(disponibileCliente) + 2 < cent(importoCliente)) {
    return {
      stato: 'troppo',
      messaggio: `Gli incassi rimborsabili di ${o.name} coprono ${inValuta(disponibileCliente, valutaCliente)}: il rimborso di ${inValuta(importoCliente, valutaCliente)} non parte.`,
    }
  }

  const transazioni: { orderId: string; parentId: string; gateway: string; kind: string; amount: string }[] = []
  // ⚠️⚠️ Da qui in giù i numeri sono NELLA VALUTA DEL CLIENTE: è quella che
  // `RefundInput.currency` dichiara, ed è quella in cui Shopify legge gli
  // importi delle transazioni. Mischiarle vorrebbe dire rendere 138,20 $.
  let daCoprire = Math.min(cent(importoCliente), cent(disponibileCliente))
  const reso = daCoprire / 100
  for (const t of incassi) {
    if (daCoprire <= 0) break
    const quota = Math.min(daCoprire, cent(t.residuoCliente))
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
    importoCliente: reso,
    valutaCliente,
    conversione,
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
      // ⚠️⚠️ La valuta del CLIENTE, non la nostra: su un ordine estero Shopify
      // legge gli importi qui sotto in questa valuta. Con `pronto.valuta`
      // (euro) renderebbe 138,20 dollari al posto di 160,00.
      currency: pronto.valutaCliente,
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
    importoCliente: pronto.importoCliente,
    valutaCliente: pronto.valutaCliente,
    totaleRimborsato: Number(refund.totalRefundedSet?.shopMoney?.amount ?? '0') || 0,
  }
}