// Le contestazioni di pagamento (chargeback) dei tre negozi.
//
// ⚠️⚠️ QUESTO È L'UNICO PUNTO IN CUI QUEST'APP PARLA CON SHOPIFY, ed è una
// deroga dichiarata alla regola scritta in `src/lib/negozi.ts` («gli ordini li
// scarica SOLO Deluxy Orders»). Quella regola nasce per non avere due verità
// sugli ORDINI; qui gli ordini non si toccano: si leggono le **contestazioni di
// pagamento**, che Orders non ha, non importa e non espone. Il confine sta nel
// codice e non nella memoria di chi passerà: le funzioni qui sotto sanno
// raggiungere `shopify_payments/disputes` e la mutazione dell'evidenza, e
// nient'altro.
//
// ⚠️ Perché vale la deroga: sono soldi con una scadenza. Contato il 19/08/2026:
// 10 contestazioni perse per 2.087,66 € e 3 aperte per 373,28 €, con le prove
// da mandare entro il 5 settembre. Il dato esisteva già dentro Shopify —
// mancava un posto dove qualcuno lo vedesse.

import { db } from './db'
import { decifra } from './crypto'

const VERSIONE_API = '2024-10'
const VERSIONE_GRAPHQL = '2025-01'

type Negozio = { id: string; nome: string; dominio: string; clientId: string; clientSecret: string }

/**
 * Un token per parlare con un negozio.
 *
 * ⚠️ Si conia al momento con le credenziali dell'app (client credentials) e non
 * si salva: dura poco, e un token in tabella è una cosa in più che scade in
 * silenzio.
 */
async function token(n: Negozio): Promise<string> {
  if (!n.clientId || !n.clientSecret) return ''
  const res = await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: n.clientId,
      client_secret: decifra(n.clientSecret),
    }),
    cache: 'no-store',
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string }
  return j.access_token ?? ''
}

async function negozi(): Promise<Negozio[]> {
  return db.negozioShopify.findMany({
    select: { id: true, nome: true, dominio: true, clientId: true, clientSecret: true },
  })
}

type DisputaShopify = {
  id: number
  order_id: number
  type: string
  amount: string
  currency: string
  reason: string
  network_reason_code: string
  status: string
  evidence_due_by: string | null
  evidence_sent_on: string | null
  finalized_on: string | null
  initiated_at: string | null
}

/** Gli stati che vogliono qualcosa da noi, adesso. */
export const STATI_APERTI = ['needs_response', 'under_review']

/** Come si chiama uno stato, in italiano. */
export function nomeStato(stato: string): string {
  const nomi: Record<string, string> = {
    needs_response: 'Da rispondere',
    under_review: 'In esame',
    charge_refunded: 'Rimborsata',
    accepted: 'Accettata',
    won: 'Vinta',
    lost: 'Persa',
  }
  return nomi[stato] ?? stato
}

/** Il motivo della contestazione, in italiano. */
export function nomeMotivo(motivo: string): string {
  const nomi: Record<string, string> = {
    fraudulent: 'Carta usata da altri (frode)',
    product_not_received: 'Prodotto mai ricevuto',
    product_unacceptable: 'Prodotto non conforme',
    duplicate: 'Pagamento doppio',
    subscription_canceled: 'Abbonamento annullato',
    unrecognized: 'Addebito non riconosciuto',
    credit_not_processed: 'Rimborso non arrivato',
    customer_initiated: 'Aperta dal cliente',
    incorrect_account_details: 'Dati del conto errati',
    insufficient_funds: 'Fondi insufficienti',
    bank_cannot_process: 'La banca non ha potuto processare',
    debit_not_authorized: 'Addebito non autorizzato',
    general: 'Generica',
  }
  return nomi[motivo] ?? motivo
}

/**
 * Rilegge le contestazioni da Shopify e le riscrive in tabella.
 *
 * ⚠️ Si riscrive tutto ogni volta TRANNE la nostra bozza: lo stato lo decide la
 * banca, non noi, e una contestazione già vinta che qui resta «da rispondere»
 * fa perdere tempo su una cosa chiusa.
 */
export async function sincronizzaChargeback(): Promise<{ letti: number; aperti: number }> {
  let letti = 0
  let aperti = 0
  for (const n of await negozi()) {
    const t = await token(n)
    if (!t) continue
    const res = await fetch(
      `https://${n.dominio}/admin/api/${VERSIONE_API}/shopify_payments/disputes.json?limit=250`,
      { headers: { 'X-Shopify-Access-Token': t }, cache: 'no-store' }
    )
    if (!res.ok) continue
    const d = (await res.json().catch(() => ({}))) as { disputes?: DisputaShopify[] }
    for (const x of d.disputes ?? []) {
      letti++
      if (STATI_APERTI.includes(x.status)) aperti++
      // L'ordine: il nostro `shopifyId` è il gid («gid://shopify/Order/123») e
      // di quello serve la coda. Se l'ordine è più vecchio dei 60 giorni che
      // teniamo in casa non lo troviamo — e va bene: il numero resta vuoto,
      // non si inventa.
      const ordine = await db.ordine.findFirst({
        where: { shopifyId: { endsWith: String(x.order_id) } },
        select: { numero: true },
      })
      const comuni = {
        negozioId: n.id,
        negozioNome: n.nome,
        ordineIdShopify: String(x.order_id),
        ordineNumero: ordine?.numero ?? '',
        tipo: x.type ?? '',
        importo: Number(x.amount) || 0,
        valuta: x.currency || 'EUR',
        motivo: x.reason ?? '',
        codiceRete: x.network_reason_code ?? '',
        stato: x.status ?? '',
        scadenzaProve: x.evidence_due_by ? new Date(x.evidence_due_by) : null,
        proveInviateIl: x.evidence_sent_on ? new Date(x.evidence_sent_on) : null,
        finalizzatoIl: x.finalized_on ? new Date(x.finalized_on) : null,
        iniziatoIl: x.initiated_at ? new Date(x.initiated_at) : null,
      }
      await db.chargeback.upsert({
        where: { id: String(x.id) },
        update: comuni,
        create: { id: String(x.id), ...comuni },
      })
    }
  }
  return { letti, aperti }
}

export type Evidenza = {
  submitted: boolean
  customerEmailAddress: string
  customerFirstName: string
  customerLastName: string
  uncategorizedText: string
  accessActivityLog: string
  cancellationPolicyDisclosure: string
  refundPolicyDisclosure: string
  refundRefusalExplanation: string
  cancellationRebuttal: string
  productDescription: string
}

/** L'evidenza già scritta su Shopify per questa contestazione. */
export async function evidenzaDaShopify(idChargeback: string): Promise<Evidenza | null> {
  const riga = await db.chargeback.findUnique({ where: { id: idChargeback } })
  if (!riga) return null
  const n = (await negozi()).find((x) => x.id === riga.negozioId)
  if (!n) return null
  const t = await token(n)
  if (!t) return null
  const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_GRAPHQL}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
    body: JSON.stringify({
      query: `{ dispute(id: "gid://shopify/ShopifyPaymentsDispute/${idChargeback}") {
        disputeEvidence {
          submitted customerEmailAddress customerFirstName customerLastName
          uncategorizedText accessActivityLog cancellationPolicyDisclosure
          refundPolicyDisclosure refundRefusalExplanation cancellationRebuttal
          productDescription
        }
      } }`,
    }),
    cache: 'no-store',
  })
  const d = (await res.json().catch(() => ({}))) as {
    data?: { dispute?: { disputeEvidence?: Partial<Evidenza> | null } | null }
  }
  const e = d.data?.dispute?.disputeEvidence
  if (!e) return null
  return {
    submitted: Boolean(e.submitted),
    customerEmailAddress: e.customerEmailAddress ?? '',
    customerFirstName: e.customerFirstName ?? '',
    customerLastName: e.customerLastName ?? '',
    uncategorizedText: e.uncategorizedText ?? '',
    accessActivityLog: e.accessActivityLog ?? '',
    cancellationPolicyDisclosure: e.cancellationPolicyDisclosure ?? '',
    refundPolicyDisclosure: e.refundPolicyDisclosure ?? '',
    refundRefusalExplanation: e.refundRefusalExplanation ?? '',
    cancellationRebuttal: e.cancellationRebuttal ?? '',
    productDescription: e.productDescription ?? '',
  }
}

export type EsitoRisposta = { ok: true; inviata: boolean } | { ok: false; errore: string }

/**
 * Manda la risposta a Shopify.
 *
 * ⚠️⚠️ `invia: true` È IRREVERSIBILE: le prove partono verso la banca e la
 * contestazione passa «in esame» — non si corregge e non si rimanda. Per questo
 * il salvataggio SENZA invio esiste ed è il gesto normale: si scrive, si
 * rilegge, e solo dopo si manda. Chi chiama deve chiedere conferma.
 */
export async function rispondiChargeback(
  idChargeback: string,
  testo: string,
  invia: boolean
): Promise<EsitoRisposta> {
  const riga = await db.chargeback.findUnique({ where: { id: idChargeback } })
  if (!riga) return { ok: false, errore: 'Contestazione non trovata.' }
  if (riga.stato !== 'needs_response') {
    return {
      ok: false,
      errore: `Questa contestazione è «${nomeStato(riga.stato)}»: Shopify non accetta più prove.`,
    }
  }
  const n = (await negozi()).find((x) => x.id === riga.negozioId)
  if (!n) return { ok: false, errore: 'Negozio non configurato.' }
  const t = await token(n)
  if (!t) return { ok: false, errore: 'Shopify non ha dato un token per questo negozio.' }

  const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_GRAPHQL}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
    body: JSON.stringify({
      query: `mutation Rispondi($id: ID!, $input: ShopifyPaymentsDisputeEvidenceUpdateInput!) {
        disputeEvidenceUpdate(id: $id, input: $input) {
          disputeEvidence { id submitted }
          userErrors { field message }
        }
      }`,
      variables: {
        id: `gid://shopify/ShopifyPaymentsDisputeEvidence/${idChargeback}`,
        input: { uncategorizedText: testo, submitEvidence: invia },
      },
    }),
    cache: 'no-store',
  })
  const d = (await res.json().catch(() => ({}))) as {
    data?: { disputeEvidenceUpdate?: { userErrors?: { message: string }[] } }
    errors?: { message: string }[]
  }
  const errore = d.errors?.[0]?.message || d.data?.disputeEvidenceUpdate?.userErrors?.[0]?.message
  if (errore) return { ok: false, errore }

  await db.chargeback.update({
    where: { id: idChargeback },
    data: { bozzaRisposta: testo, ...(invia ? { proveInviateIl: new Date() } : {}) },
  })
  return { ok: true, inviata: invia }
}
