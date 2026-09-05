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

/** Dove Transactions ci manda gli esiti. Solo https, altrimenti niente. */
function urlNotifica(): string {
  const app = (process.env.APP_URL ?? '').trim().replace(/\/$/, '')
  return /^https:\/\//i.test(app) ? `${app}/api/pagamenti/notifica` : ''
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
  /** iban | link | paypal | carta | altro — dal 28/08 Transactions li accetta tutti. */
  metodo?: string
  /** Il «come si paga» quando non è un IBAN (link, indirizzo PayPal, nota). */
  riferimentoPagamento?: string
  causale?: string
  note?: string
}): Promise<EsitoTransactions> {
  const riferimentoEsterno = `cs-${d.riferimento}`
  const metodo = (d.metodo || 'iban').trim()
  try {
    const { stato, dati } = await chiamataFirmata(
      'POST',
      '/api/v1/richieste',
      {
        importo: d.importo.toFixed(2),
        beneficiario: d.beneficiario.slice(0, 120),
        metodo,
        ...(metodo === 'iban'
          ? { iban: d.iban.replace(/\s+/g, '').toUpperCase() }
          : { riferimentoPagamento: (d.riferimentoPagamento ?? '').trim() }),
        causale: (d.causale || `Fornitore ordine — ${d.beneficiario}`).slice(0, 140), // limite SEPA
        categoria: 'fornitore',
        ...(d.note ? { note: d.note } : {}),
        riferimentoEsterno,
        // L'esito (approvata/pagata/annullata, con gli allegati-prova) torna
        // qui: è quello che dal 28/08 aggiorna la riga DA SOLO. Solo se l'app
        // sa dove abita: senza APP_URL https il campo non parte.
        ...(urlNotifica() ? { urlNotifica: urlNotifica() } : {}),
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

// ── Il verso di RITORNO: gli esiti che Transactions ci manda ──

/**
 * Verifica la firma di una notifica in arrivo da Transactions. Fail-closed
 * per costruzione (modello deluxy-partner): senza segreto non si verifica
 * niente e non ci si fida di niente; la finestra è ±5 minuti sul timestamp
 * dell'header — ogni ritentativo arriva RIFIRMATO fresco, quindi la finestra
 * non va allargata.
 */
export function notificaAutentica(corpoGrezzo: string, headers: Headers): boolean {
  const segreto = (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  if (!segreto) return false
  const timestamp = (headers.get('x-deluxy-timestamp') ?? '').trim()
  const firma = (headers.get('x-deluxy-signature') ?? '').replace(/^sha256=/i, '').trim()
  if (!timestamp || !firma) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) return false
  const impronta = createHash('sha256').update(corpoGrezzo).digest('hex')
  const attesa = createHmac('sha256', segreto).update(`${timestamp}\n${impronta}`).digest('hex')
  if (attesa.length !== firma.length) return false
  let diff = 0
  for (let i = 0; i < attesa.length; i++) diff |= attesa.charCodeAt(i) ^ firma.charCodeAt(i)
  return diff === 0
}

/**
 * Scarica un allegato (la PROVA del pagamento) da Transactions, con firma.
 * Verifica lo sha256 annunciato: una copia sostituita non passa.
 */
export async function scaricaAllegatoTransactions(
  riferimentoTrx: string,
  allegatoId: string,
  sha256Atteso?: string
): Promise<{ ok: true; dati: Buffer; tipo: string; nome: string } | { ok: false; errore: string }> {
  const apiKey = (process.env.TRANSACTIONS_API_KEY ?? '').trim()
  const segreto = (process.env.TRANSACTIONS_HMAC_SECRET ?? '').trim()
  if (!apiKey || !segreto) return { ok: false, errore: 'Transactions non configurata.' }

  const percorso = `/api/v1/richieste/${encodeURIComponent(riferimentoTrx)}/allegati/${encodeURIComponent(allegatoId)}`
  const timestamp = String(Date.now())
  const nonce = randomUUID()
  const impronta = createHash('sha256').update('').digest('hex')
  const firma = createHmac('sha256', segreto)
    .update(['GET', percorso, timestamp, nonce, impronta].join('\n'))
    .digest('hex')
  try {
    const res = await fetch(`${baseUrl()}${percorso}`, {
      headers: {
        'x-api-key': apiKey,
        'x-deluxy-timestamp': timestamp,
        'x-deluxy-nonce': nonce,
        'x-deluxy-signature': `sha256=${firma}`,
      },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, errore: `Transactions ha risposto ${res.status}.` }
    const dati = Buffer.from(await res.arrayBuffer())
    const veroSha = createHash('sha256').update(dati).digest('hex')
    if (sha256Atteso && veroSha !== sha256Atteso) {
      return { ok: false, errore: 'Il file scaricato non corrisponde allo sha256 annunciato: scartato.' }
    }
    const tipo = res.headers.get('content-type') ?? 'application/octet-stream'
    const disp = res.headers.get('content-disposition') ?? ''
    const nome = /filename="([^"]+)"/.exec(disp)?.[1] ?? 'prova-pagamento'
    return { ok: true, dati, tipo, nome }
  } catch (e) {
    return { ok: false, errore: (e as Error).message }
  }
}

/** Da dove esce il denaro nel nostro vocabolario (`USCITE`) → il vocabolario di
 *  Transactions (`METODI_FUORI`). «app» non arriva mai qui: se ha pagato
 *  Transactions è lei a dircelo, non il contrario. Vuoto = «non indicato» qui,
 *  «altro» di là: di là il metodo è obbligatorio. */
function metodoFuoriDa(pagatoCon: string): string {
  switch (pagatoCon) {
    case 'banca':
      return 'bonifico_banca'
    case 'contanti':
      return 'contanti'
    case 'compensazione':
      return 'compensazione'
    default:
      return 'altro'
  }
}

/**
 * Dice a Transactions che il fornitore è GIÀ stato pagato per un'altra strada
 * (05/09/2026): la richiesta di là esce dalla coda come «pagata fuori
 * dall'app», altrimenti un operatore la pagherebbe una seconda volta. Si
 * chiama quando qui si preme «Pagata» su una richiesta già mandata a
 * Transactions e non ancora pagata di là. La risposta torna alla pagina: un
 * fallimento si scrive, non si tace.
 */
export async function segnaPagataFuoriTransactions(d: {
  riferimento: string
  pagatoCon: string
  pagataIl: Date
  pagataDa: string
}): Promise<{ ok: true; messaggio: string } | { ok: false; errore: string }> {
  const riferimentoEsterno = `cs-${d.riferimento}`
  try {
    const { stato, dati } = await chiamataFirmata(
      'POST',
      `/api/v1/richieste/${encodeURIComponent(riferimentoEsterno)}/pagata-fuori`,
      {
        metodo: metodoFuoriDa(d.pagatoCon),
        dataPagamento: d.pagataIl.toISOString().slice(0, 10),
        motivo: `Segnata pagata nel Customer Service da ${d.pagataDa}${d.pagatoCon ? ` (${d.pagatoCon})` : ' (canale non indicato)'}.`,
      }
    )
    if (stato === 200 || stato === 201) {
      return { ok: true, messaggio: String(dati?.messaggio ?? 'Transactions aggiornata.') }
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
