import { leggiImpostazioni } from './impostazioni'
import { transactionsConfigurata, richiediPagamentoFornitore, statoRichiestaTransactions } from './transactions'

// Il «Paga» del Customer Service.
//
// IL CANALE A NORMA È DELUXY TRANSACTIONS (contratto dell'ecosistema: l'unica
// app da cui può uscire denaro, richieste firmate HMAC con nonce e idempotenza,
// autorizzazione umana con secondo fattore). Con TRANSACTIONS_URL /
// TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET impostate, ogni richiesta va
// lì — e se Transactions risponde con un errore NON si ripiega sul canale
// vecchio: un guasto del canale sicuro non deve far uscire un bonifico dal
// canale debole, in silenzio.
//
// FINCHÉ quelle variabili non ci sono, resta il vecchio ponte verso Deluxy
// Partner (`POST {partnerUrl}/api/richieste-pagamento`, sola chiave): serviva
// prima dell'audit del 24/08/2026 e resta come ripiego dichiarato, così il
// trasloco non blocca i pagamenti. L'esito dice sempre da che canale è passato.
//
// L'invio è idempotente sul `riferimento` in entrambi i canali: rimandare la
// stessa richiesta non la duplica mai.

const BASE_DEFAULT = 'https://deluxy-partner.vercel.app'
const APP = 'deluxy-messaging'

async function config(): Promise<{ base: string; chiave: string } | null> {
  const c = await leggiImpostazioni(['partnerUrl', 'partnerApiKey'])
  if (!c.partnerApiKey) return null
  return { base: (c.partnerUrl || BASE_DEFAULT).replace(/\/$/, ''), chiave: c.partnerApiKey }
}

export type DatiRichiesta = {
  importo: number
  beneficiario: string
  iban: string
  bic?: string
  causale?: string
  contatto?: string
  linkConversazione?: string
  riferimento: string
  note?: string
}

export type EsitoInvio =
  | { stato: 'ok'; id: string; statoRichiesta: string; aggiornata?: boolean; canale: 'transactions' | 'finance' }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/** Manda la richiesta di pagamento: a Transactions se configurata (canale a
 *  norma), altrimenti al vecchio ponte Partner. L'importo dev'essere > 0. */
export async function inviaRichiestaPagamento(d: DatiRichiesta): Promise<EsitoInvio> {
  if (!(d.importo > 0)) {
    return { stato: 'errore', messaggio: 'Si accettano solo richieste con un importo maggiore di zero.' }
  }

  if (transactionsConfigurata()) {
    const note = [d.note, d.contatto && `Contatto: ${d.contatto}`, d.linkConversazione && `Conversazione: ${d.linkConversazione}`]
      .filter(Boolean)
      .join('\n')
    const t = await richiediPagamentoFornitore({
      riferimento: d.riferimento,
      importo: d.importo,
      beneficiario: d.beneficiario,
      iban: d.iban,
      causale: d.causale,
      note: note || undefined,
    })
    if (t.ok) {
      return { stato: 'ok', id: t.riferimento, statoRichiesta: t.stato, aggiornata: t.ripetuta, canale: 'transactions' }
    }
    // Niente ripiego sul canale vecchio: l'errore si mostra e si riprova.
    return { stato: 'errore', messaggio: t.errore }
  }

  const c = await config()
  if (!c) return { stato: 'non-configurato' }

  let res: Response
  try {
    res = await fetch(`${c.base}/api/richieste-pagamento`, {
      method: 'POST',
      headers: {
        'X-API-Key': c.chiave,
        'X-App': APP,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        importo: d.importo,
        beneficiario: d.beneficiario,
        iban: d.iban,
        bic: d.bic || undefined,
        causale: d.causale || undefined,
        contatto: d.contatto || undefined,
        linkConversazione: d.linkConversazione || undefined,
        riferimento: d.riferimento,
        note: d.note || undefined,
      }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
  } catch (e) {
    const err = e as Error
    return {
      stato: 'errore',
      messaggio:
        err.name === 'TimeoutError'
          ? 'Partner non ha risposto in tempo.'
          : `Partner non raggiungibile: ${err.message}`,
    }
  }

  const corpo = (await res.json().catch(() => ({}))) as {
    id?: string
    stato?: string
    aggiornata?: boolean
    errore?: string
  }
  if (!res.ok || !corpo.id) {
    if (res.status === 401) {
      return { stato: 'errore', messaggio: 'Chiave API di Partner non valida (Impostazioni).' }
    }
    return { stato: 'errore', messaggio: corpo.errore || `Partner ha risposto ${res.status}.` }
  }

  return {
    stato: 'ok',
    id: corpo.id,
    statoRichiesta: corpo.stato ?? 'in_attesa',
    aggiornata: corpo.aggiornata,
    canale: 'finance',
  }
}

/** A che punto è una richiesta già inviata. Il `canale` è quello registrato
 *  all'invio: se manca (richieste vecchie) si prova prima Transactions quando è
 *  configurata, e si ripiega su Partner — solo per la LETTURA dello stato. */
export async function statoRichiestaPartner(
  riferimento: string,
  canale?: string
): Promise<{ stato: string; decisoIl: string | null } | null> {
  if (canale === 'transactions' || (!canale && transactionsConfigurata())) {
    const t = await statoRichiestaTransactions(riferimento)
    if (t) return t
    if (canale === 'transactions') return null
  }
  const c = await config()
  if (!c) return null
  try {
    const res = await fetch(
      `${c.base}/api/richieste-pagamento?riferimento=${encodeURIComponent(riferimento)}`,
      {
        headers: { 'X-API-Key': c.chiave, 'X-App': APP },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const d = (await res.json()) as { stato?: string; decisoIl?: string | null }
    return { stato: d.stato ?? '', decisoIl: d.decisoIl ?? null }
  } catch {
    return null
  }
}
