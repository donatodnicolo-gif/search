import { leggiImpostazioni } from './impostazioni'

// Ponte verso Deluxy Partner, che approva e paga le richieste.
//
//   POST {partnerUrl}/api/richieste-pagamento
//   header: X-API-Key: <chiave>   X-App: deluxy-messaging
//
// L'invio è idempotente su (app di origine, `riferimento`): rimandare la stessa
// richiesta la aggiorna finché è "in_attesa", e non la duplica mai.

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
  | { stato: 'ok'; id: string; statoRichiesta: string; aggiornata?: boolean }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/** Manda la richiesta a Partner. L'importo dev'essere maggiore di zero. */
export async function inviaRichiestaPagamento(d: DatiRichiesta): Promise<EsitoInvio> {
  const c = await config()
  if (!c) return { stato: 'non-configurato' }
  if (!(d.importo > 0)) {
    return { stato: 'errore', messaggio: 'Partner accetta solo richieste con un importo maggiore di zero.' }
  }

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
  }
}

/** Chiede a Partner a che punto è una richiesta già inviata. */
export async function statoRichiestaPartner(
  riferimento: string
): Promise<{ stato: string; decisoIl: string | null } | null> {
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
