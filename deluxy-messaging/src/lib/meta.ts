// Chiamate alle Graph API di Meta per INVIARE messaggi.
// WhatsApp Cloud API: POST /{phoneNumberId}/messages con token WhatsApp.
// Messenger e Instagram: POST /me/messages con il Page Access Token
// (per Instagram serve una pagina collegata all'account IG professionale).

const GRAPH = 'https://graph.facebook.com/v21.0'

type EsitoInvio = { ok: true; idEsterno: string } | { ok: false; errore: string }

async function chiamaGraph(url: string, corpo: unknown, token: string): Promise<EsitoInvio> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
    })
    const dati = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      message_id?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      return { ok: false, errore: dati.error?.message || `Meta ha risposto ${res.status}` }
    }
    return { ok: true, idEsterno: dati.messages?.[0]?.id || dati.message_id || '' }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore di rete verso Meta' }
  }
}

/** Invia un messaggio di testo WhatsApp al numero `a` (formato internazionale senza +). */
export async function inviaWhatsApp(
  token: string,
  phoneNumberId: string,
  a: string,
  testo: string
): Promise<EsitoInvio> {
  return chiamaGraph(
    `${GRAPH}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: a,
      type: 'text',
      text: { body: testo },
    },
    token
  )
}

// ── Allegati WhatsApp ──
//
// Mandare un file è in DUE passi, non uno: prima si carica su Meta e si ottiene
// un id, poi si manda un messaggio che punta a quell'id. Il file resta da loro:
// noi non teniamo nessuna copia, e per rivederlo si ripassa da `/api/media`.

/** Che tipo di messaggio WhatsApp fare, a partire dal tipo del file. */
export function tipoMediaWhatsApp(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

/** Carica un file sulla Cloud API e restituisce l'id del media. */
export async function caricaMediaWhatsApp(
  token: string,
  phoneNumberId: string,
  file: File
): Promise<{ ok: true; mediaId: string } | { ok: false; errore: string }> {
  try {
    const modulo = new FormData()
    modulo.append('messaging_product', 'whatsapp')
    modulo.append('type', file.type)
    modulo.append('file', file, file.name)
    const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: modulo,
    })
    const dati = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string }
    }
    if (!res.ok || !dati.id) {
      return { ok: false, errore: dati.error?.message || `Meta ha risposto ${res.status}` }
    }
    return { ok: true, mediaId: dati.id }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore di rete verso Meta' }
  }
}

/** Manda un file già caricato. La didascalia esiste solo su foto e documenti. */
export async function inviaMediaWhatsApp(
  token: string,
  phoneNumberId: string,
  a: string,
  media: { id: string; tipo: 'image' | 'video' | 'audio' | 'document'; nome?: string; didascalia?: string }
): Promise<EsitoInvio> {
  const corpo: Record<string, unknown> = { id: media.id }
  if (media.didascalia && media.tipo !== 'audio') corpo.caption = media.didascalia
  if (media.tipo === 'document' && media.nome) corpo.filename = media.nome
  return chiamaGraph(
    `${GRAPH}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: a,
      type: media.tipo,
      [media.tipo]: corpo,
    },
    token
  )
}

/**
 * L'indirizzo da cui scaricare un media, dato il suo id.
 *
 * ⚠️ Vale pochi minuti e **si scarica col token**: aprirlo nel browser senza
 * l'intestazione di autorizzazione dà 401. Per questo le miniature passano da
 * `/api/media/[id]`, che è dentro la nostra sessione, invece di finire come
 * `src` in una pagina.
 */
export async function urlMediaWhatsApp(
  token: string,
  mediaId: string
): Promise<{ ok: true; url: string; mimeType: string } | { ok: false; errore: string }> {
  try {
    const res = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
    const dati = (await res.json().catch(() => ({}))) as {
      url?: string
      mime_type?: string
      error?: { message?: string }
    }
    if (!res.ok || !dati.url) {
      return { ok: false, errore: dati.error?.message || `Meta ha risposto ${res.status}` }
    }
    return { ok: true, url: dati.url, mimeType: dati.mime_type ?? '' }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : 'Errore di rete verso Meta' }
  }
}

/**
 * Invia un testo su Messenger (PSID) o Instagram (IGSID) col Page Access Token.
 *
 * `mittenteId` è il NOSTRO account da cui esce il messaggio: la Pagina o il
 * profilo Instagram. Con più account collegati va passato, perché `/me`
 * significa «l'account di questo token» e col token generale sarebbe l'account
 * sbagliato — il cliente riceverebbe una risposta da un marchio a cui non ha
 * scritto. Con un account solo, `/me` va bene ed è il ripiego.
 */
export async function inviaPagina(
  token: string,
  destinatarioId: string,
  testo: string,
  mittenteId = ''
): Promise<EsitoInvio> {
  return chiamaGraph(
    `${GRAPH}/${mittenteId || 'me'}/messages`,
    {
      recipient: { id: destinatarioId },
      messaging_type: 'RESPONSE',
      message: { text: testo },
    },
    token
  )
}
