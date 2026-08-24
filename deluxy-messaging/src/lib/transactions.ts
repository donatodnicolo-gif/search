import { createHash, createHmac, randomUUID } from 'crypto'

// Client di **Deluxy Transactions**, l'unica app da cui può uscire denaro.
//
// Regola dell'ecosistema (CLAUDE.md di repo): nessuna app paga nessuno per
// conto proprio. Il «Paga» del Customer Service non manda un bonifico: manda
// una RICHIESTA. Il denaro esce solo dopo che una persona l'ha autorizzata
// dentro Transactions, con secondo fattore e — sopra soglia — doppia firma.
//
// Ogni chiamata è firmata: chiave (`x-api-key`) + HMAC-SHA256 con un segreto
// separato. La firma copre metodo, percorso, marca temporale e nonce: una
// richiesta intercettata non si può rigiocare né modificare. È lo stesso client
// già in produzione in deluxy-partner (src/lib/transactions.ts), adattato.
//
// Env (SOLO env, mai nel database: sono le credenziali che muovono denaro):
//   TRANSACTIONS_URL · TRANSACTIONS_API_KEY · TRANSACTIONS_HMAC_SECRET

const BASE_DEFAULT = 'https://deluxy-transactions.vercel.app'

function baseUrl(): string {
  return ((process.env.TRANSACTIONS_URL ?? '').trim() || BASE_DEFAULT).replace(/\/$/, '')
}

/** Vero quando il canale a norma è pronto: con le tre variabili impostate il
 *  «Paga» va a Transactions; senza, si ripiega sul vecchio canale Finance
 *  (vedi partner.ts) invece di bloccare i pagamenti a metà del trasloco. */
export function transactionsConfigurata(): boolean {
  return Boolean(
    (process.env.TRANSACTIONS_API_KEY ?? '').trim() && (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  )
}

async function chiamataFirmata(
  metodo: 'GET' | 'POST',
  percorso: string,
  corpoOggetto?: unknown,
  idempotenza?: string
): Promise<{ stato: number; dati: Record<string, unknown> | null }> {
  const apiKey = (process.env.TRANSACTIONS_API_KEY ?? '').trim()
  const segreto = (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  if (!apiKey || !segreto) {
    throw new Error('Transactions non configurata: mancano TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET.')
  }

  const corpo = corpoOggetto ? JSON.stringify(corpoOggetto) : ''
  const timestamp = String(Date.now())
  const nonce = randomUUID()
  const impronta = createHash('sha256').update(corpo).digest('hex')
  const daFirmare = [metodo, percorso, timestamp, nonce, impronta].join('\n')
  const firma = createHmac('sha256', segreto).update(daFirmare).digest('hex')

  const res = await fetch(`${baseUrl()}${percorso}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-deluxy-timestamp': timestamp,
      'x-deluxy-nonce': nonce,
      'x-deluxy-signature': `sha256=${firma}`,
      ...(idempotenza ? { 'x-idempotency-key': idempotenza } : {}),
    },
    ...(corpo ? { body: corpo } : {}),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  return { stato: res.status, dati: (await res.json().catch(() => null)) as Record<string, unknown> | null }
}

export type EsitoTransactions =
  | { ok: true; riferimento: string; stato: string; ripetuta: boolean }
  | { ok: false; errore: string }

/** Chiede a Transactions il pagamento di un fornitore.
 *
 *  `riferimento` è la chiave della nostra RichiestaPagamento: entra come
 *  `riferimentoEsterno` E come chiave di idempotenza, così un doppio clic o un
 *  retry di rete non possono generare due pagamenti — su un'app che muove
 *  denaro è la garanzia che conta più di tutte. */
export async function richiediPagamentoFornitore(d: {
  riferimento: string
  importo: number
  beneficiario: string
  iban: string
  causale?: string
  note?: string
}): Promise<EsitoTransactions> {
  const riferimentoEsterno = `cs-${d.riferimento}`
  try {
    const { stato, dati } = await chiamataFirmata(
      'POST',
      '/api/v1/richieste',
      {
        importo: d.importo.toFixed(2),
        beneficiario: d.beneficiario.slice(0, 120),
        iban: d.iban.replace(/\s+/g, '').toUpperCase(),
        causale: (d.causale || `Fornitore ordine — ${d.beneficiario}`).slice(0, 140), // limite SEPA
        categoria: 'fornitore',
        ...(d.note ? { note: d.note } : {}),
        riferimentoEsterno,
      },
      riferimentoEsterno
    )
    if (stato === 200 || stato === 201) {
      return {
        ok: true,
        riferimento: String(dati?.riferimento ?? riferimentoEsterno),
        stato: String(dati?.stato ?? 'in_attesa'),
        ripetuta: Boolean(dati?.ripetuta),
      }
    }
    const msg = dati?.errore ?? dati?.error ?? dati?.messaggio
    return { ok: false, errore: `Transactions ha risposto ${stato}${msg ? `: ${String(msg)}` : ''}` }
  } catch (e) {
    return { ok: false, errore: `Transactions non raggiungibile: ${(e as Error).message}` }
  }
}

/** A che punto è una richiesta già inviata (per la spunta sulla scheda). */
export async function statoRichiestaTransactions(
  riferimento: string
): Promise<{ stato: string; decisoIl: string | null } | null> {
  try {
    const { stato, dati } = await chiamataFirmata(
      'GET',
      `/api/v1/richieste?riferimentoEsterno=${encodeURIComponent(`cs-${riferimento}`)}`
    )
    if (stato !== 200 || !dati) return null
    // La risposta di Transactions chiama il campo `decisaIl` (la richiesta è
    // femminile là): qui si rimappa sul nome che usa già la scheda.
    const righe = (dati.richieste ?? []) as { stato?: string; decisaIl?: string | null }[]
    const r = Array.isArray(righe) ? righe[0] : null
    if (!r) return null
    return { stato: r.stato ?? '', decisoIl: r.decisaIl ?? null }
  } catch {
    return null
  }
}
