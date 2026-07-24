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

/** Invia un testo su Messenger (PSID) o Instagram (IGSID) col Page Access Token. */
export async function inviaPagina(
  token: string,
  destinatarioId: string,
  testo: string
): Promise<EsitoInvio> {
  return chiamaGraph(
    `${GRAPH}/me/messages`,
    {
      recipient: { id: destinatarioId },
      messaging_type: 'RESPONSE',
      message: { text: testo },
    },
    token
  )
}
