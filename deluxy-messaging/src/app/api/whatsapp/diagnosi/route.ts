import { NextResponse } from 'next/server'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// DIAGNOSI WHATSAPP: perché non arrivano i messaggi.
//
// Nasce da un blocco reale: webhook verificato, credenziali salvate, e in inbox
// zero messaggi. Da fuori non si distingue fra «Meta non ci chiama», «ci chiama
// ma lo respingiamo» e «arriva ma non lo salviamo», e l'unico modo era far
// cliccare l'operatore a caso nella dashboard di Meta.
//
// Qui l'app usa le credenziali che ha già in cassaforte e CHIEDE A META com'è
// messa. Nessun segreto esce dalla risposta: solo esiti.

const API = 'https://graph.facebook.com/v21.0'

type Esito = {
  passo: string
  ok: boolean | null // null = non si è potuto controllare
  dettaglio: string
}

async function chiedi(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; type?: string; code?: number }
  }
  return { ok: res.ok, stato: res.status, corpo }
}

export async function GET() {
  const c = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'waBusinessAccountId',
    'metaVerifyToken',
    'metaAppSecret',
  ])
  const esiti: Esito[] = []

  // 1. Quello che dipende solo da noi.
  esiti.push({
    passo: 'Verify token salvato nell’app',
    ok: Boolean(c.metaVerifyToken?.trim()),
    dettaglio: c.metaVerifyToken?.trim()
      ? 'C’è: l’handshake di Meta può funzionare.'
      : 'Manca: la verifica del webhook su Meta fallirà con 403.',
  })
  esiti.push({
    passo: 'App Secret salvato',
    ok: Boolean(c.metaAppSecret?.trim()),
    dettaglio: c.metaAppSecret?.trim()
      ? 'C’è: accettiamo solo richieste firmate da Meta.'
      : 'Manca: il webhook accetta chiunque conosca l’indirizzo. Da riempire.',
  })

  const token = c.waToken?.trim()
  const numeroId = c.waPhoneNumberId?.trim()
  if (!token || !numeroId) {
    esiti.push({
      passo: 'Token e Phone Number ID',
      ok: false,
      dettaglio: 'Mancano: senza non si può chiedere niente a Meta.',
    })
    return NextResponse.json({ esiti, conclusione: 'Configurazione incompleta nell’app.' })
  }

  // 2. Il token è valido e vede quel numero?
  const num = await chiedi(
    `${API}/${numeroId}?fields=display_phone_number,verified_name,quality_rating,platform_type`,
    token
  )
  esiti.push({
    passo: 'Il token vede il numero',
    ok: num.ok,
    dettaglio: num.ok
      ? `Numero ${num.corpo.display_phone_number ?? '?'} (${num.corpo.verified_name ?? '?'}), qualità ${num.corpo.quality_rating ?? 'n/d'}.`
      : `Meta risponde ${num.stato}: ${num.corpo.error?.message ?? 'errore sconosciuto'}.`,
  })
  if (!num.ok) {
    return NextResponse.json({
      esiti,
      conclusione:
        'Il token non è valido per questo numero: rigeneralo (Utente di sistema, permesso whatsapp_business_messaging) e ricontrolla il Phone Number ID.',
    })
  }

  // 3. LA DOMANDA CHE CONTA: la nostra app è iscritta al WhatsApp Business?
  //    Senza questa iscrizione Meta non manda NIENTE, per quanto il webhook sia
  //    verificato — ed è il caso che non si vede da nessuna parte nell'app.
  const wabaId = c.waBusinessAccountId?.trim()
  if (!wabaId) {
    esiti.push({
      passo: 'App iscritta al WhatsApp Business (WABA)',
      ok: null,
      dettaglio:
        'Non controllabile: manca l’ID del WhatsApp Business Account in Impostazioni. È il numero lungo che vedi in WhatsApp Manager sotto il nome dell’account.',
    })
  } else {
    const iscr = await chiedi(`${API}/${wabaId}/subscribed_apps`, token)
    const app = (iscr.corpo.data as { whatsapp_business_api_data?: { name?: string } }[]) ?? []
    esiti.push({
      passo: 'App iscritta al WhatsApp Business (WABA)',
      ok: iscr.ok ? app.length > 0 : false,
      dettaglio: !iscr.ok
        ? `Meta risponde ${iscr.stato}: ${iscr.corpo.error?.message ?? 'errore'}.`
        : app.length
          ? `Iscritte: ${app.map((a) => a.whatsapp_business_api_data?.name ?? '?').join(', ')}.`
          : 'NESSUNA app iscritta a questo WABA: ecco perché non arriva niente. Va iscritta l’app (Meta → WhatsApp → Configurazione, oppure POST /{waba-id}/subscribed_apps).',
    })
  }

  // 4. Cosa è arrivato davvero da noi.
  const [conv, msg] = await Promise.all([db.conversazione.count(), db.messaggio.count()])
  esiti.push({
    passo: 'Messaggi ricevuti finora',
    ok: msg > 0,
    dettaglio:
      msg > 0
        ? `${msg} messaggi in ${conv} conversazioni.`
        : 'Nessuno: se i passi qui sopra sono tutti verdi, manda un messaggio di prova al numero.',
  })

  const rotti = esiti.filter((e) => e.ok === false)
  return NextResponse.json({
    esiti,
    conclusione: rotti.length
      ? `Da sistemare: ${rotti.map((r) => r.passo).join('; ')}.`
      : 'Tutto a posto da questa parte: se non arriva nulla, manda un messaggio di prova.',
  })
}
