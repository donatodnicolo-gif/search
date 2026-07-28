import { NextRequest, NextResponse } from 'next/server'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// VERIFICA DEL NUMERO: il codice che si RICEVE.
//
// ⚠️ Da non confondere col PIN del `register`, ed è una confusione che costa
// tempo: sono due cose diverse.
//  - Il CODICE (qui) lo manda Meta per SMS o con una TELEFONATA, ed è la prova
//    che il numero è tuo. Si chiede, si aspetta, si inserisce.
//  - Il PIN (in /api/whatsapp/registra) lo SCEGLI TU: è la verifica in due
//    passaggi di quel numero, non lo riceve nessuno. Se ne era già stato
//    impostato uno, va usato quello — e se è perduto si azzera da WhatsApp
//    Manager.
//
// Serve solo se il numero non è ancora verificato. Un numero già in uso in un
// WhatsApp Business Account di solito lo è già, e si passa dritti al register.

const API = 'https://graph.facebook.com/v21.0'

/**
 * I codici di Meta tradotti nel passo successivo.
 *
 * ⚠️ «Riprova più tardi» è il messaggio più inutile che ci sia: non dice se
 * aspettare due minuti o due ore, né se il problema si risolve aspettando. Il
 * CODICE numerico invece distingue i casi, e va mostrato: senza, si continua a
 * premere lo stesso bottone sperando che cambi qualcosa.
 */
const SPIEGAZIONI: Record<number, string> = {
  133004:
    'Meta dice che il servizio è momentaneamente non disponibile: qui aspettare serve davvero, riprova fra qualche minuto.',
  133005:
    'Sul numero c’è già una verifica in due passaggi attiva: il codice non si può richiedere finché non la sblocchi da WhatsApp Manager (impostazioni del numero → Verifica in due passaggi).',
  133015:
    'Il numero è in lavorazione su Meta (registrazione o cancellazione in corso): aspetta che finisca prima di richiedere il codice.',
  4: 'Troppe richieste in poco tempo: Meta ha messo un limite, riprova fra un’ora.',
  80007: 'Troppe richieste in poco tempo: Meta ha messo un limite, riprova più tardi.',
  131000:
    'Errore generico di Meta. Se si ripete, fai la verifica direttamente da WhatsApp Manager: la sua procedura guidata gestisce meglio i numeri fissi.',
  // ⚠️ 136024 NON è nella lista ufficiale degli errori della Cloud API
  // (developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes):
  // cercato, non documentato. Quindi qui non si spiega cosa significhi — si
  // dice cosa fare, che è l'unica cosa onesta e l'unica utile. Se un giorno
  // Meta lo documenta, questa riga si aggiorna.
  136024:
    'Meta rifiuta di mandare il codice a questo numero e non spiega perché (codice non documentato). Nell’ordine: 1) controlla che il numero non sia ancora attivo sull’app WhatsApp Business di un telefono — finché è lì non può passare alla Cloud API, va rimosso da quell’app; 2) fai la verifica dalla procedura guidata di WhatsApp Manager invece che da qui, che gestisce meglio i fissi; 3) se persiste, è un caso da assistenza Meta.',
}

/** L'errore di Meta con il codice in chiaro, più il passo successivo. */
function errore(stato: number, corpo: { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } }) {
  const e = corpo.error
  const codice = e?.code
  const pezzi = [
    codice ? `(#${codice}${e?.error_subcode ? '/' + e.error_subcode : ''})` : '',
    e?.error_user_msg || e?.message || `errore ${stato}`,
  ].filter(Boolean)
  return { errore: `Meta risponde: ${pezzi.join(' ')}`, cosaFare: SPIEGAZIONI[codice ?? 0] }
}

async function numeroETokens(body: unknown) {
  const { phoneNumberId } = (body ?? {}) as { phoneNumberId?: string }
  const numero = (phoneNumberId ?? '').replace(/\D/g, '')
  if (!numero) return { errore: 'Manca il numero.' as const }
  const token = (await tokenPerNumero(numero)).trim()
  if (!token) return { errore: 'Nessun token per questo numero (Impostazioni).' as const }
  return { numero, token }
}

/** Chiede a Meta di mandare il codice: per SMS o con una telefonata. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dati = await numeroETokens(body)
  if ('errore' in dati) return NextResponse.json({ errore: dati.errore }, { status: 400 })

  const { metodo, lingua } = body as { metodo?: string; lingua?: string }
  // VOICE = telefonata, SMS = messaggio. Chi ha un fisso può ricevere solo la
  // telefonata, ed è il caso di un numero 02.
  const code_method = metodo === 'SMS' ? 'SMS' : 'VOICE'

  try {
    const res = await fetch(`${API}/${dati.numero}/request_code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dati.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_method, language: lingua || 'it' }),
      signal: AbortSignal.timeout(20000),
    })
    const corpo = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }
    }
    if (!res.ok) return NextResponse.json(errore(res.status, corpo), { status: 502 })
    return NextResponse.json({
      ok: true,
      messaggio:
        code_method === 'VOICE'
          ? 'Meta sta chiamando il numero e detterà un codice di 6 cifre: scrivilo qui sotto.'
          : 'Meta ha mandato un SMS con un codice di 6 cifre: scrivilo qui sotto.',
    })
  } catch (e) {
    return NextResponse.json({ errore: `Richiesta non riuscita: ${(e as Error).message}` }, { status: 502 })
  }
}

/** Conferma il codice ricevuto. */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dati = await numeroETokens(body)
  if ('errore' in dati) return NextResponse.json({ errore: dati.errore }, { status: 400 })

  const codice = String((body as { codice?: string }).codice ?? '').replace(/\D/g, '')
  if (codice.length !== 6) {
    return NextResponse.json({ errore: 'Il codice ricevuto è di 6 cifre.' }, { status: 400 })
  }

  try {
    const res = await fetch(`${API}/${dati.numero}/verify_code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dati.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codice }),
      signal: AbortSignal.timeout(20000),
    })
    const corpo = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }
    }
    if (!res.ok) return NextResponse.json(errore(res.status, corpo), { status: 502 })
    return NextResponse.json({
      ok: true,
      messaggio: 'Numero verificato. Ora registralo scegliendo un PIN di 6 cifre.',
    })
  } catch (e) {
    return NextResponse.json({ errore: `Verifica non riuscita: ${(e as Error).message}` }, { status: 502 })
  }
}
