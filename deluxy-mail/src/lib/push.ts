import webpush from 'web-push'
import { db } from './db'

// Notifiche push (Web Push). Le chiavi VAPID stanno nelle env di Vercel:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (coppia generata una volta)
//   VAPID_SUBJECT                          (mailto:... o l'URL dell'app)
// Il client usa NEXT_PUBLIC_VAPID_PUBLIC_KEY (stesso valore pubblico) per
// iscriversi. Senza chiavi, l'invio è un no-op silenzioso.

let configurato = false
function configura(): boolean {
  if (configurato) return true
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) return false
  const subject = (process.env.VAPID_SUBJECT || 'mailto:posta@deluxy.it').trim()
  webpush.setVapidDetails(subject, pub, priv)
  configurato = true
  return true
}

export type PayloadPush = { titolo: string; corpo: string; url?: string }

/** Invia una notifica a TUTTI i dispositivi iscritti di un utente. Le
 *  iscrizioni scadute (404/410) vengono rimosse. Non lancia mai. */
export async function inviaPush(utenteId: string, payload: PayloadPush): Promise<void> {
  if (!configura()) return
  let iscrizioni: { id: string; endpoint: string; p256dh: string; auth: string }[] = []
  try {
    iscrizioni = await db.pushIscrizione.findMany({ where: { utenteId } })
  } catch {
    return // tabella non ancora migrata
  }
  const body = JSON.stringify(payload)
  await Promise.all(
    iscrizioni.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        )
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          await db.pushIscrizione.deleteMany({ where: { id: s.id } }).catch(() => {})
        }
      }
    })
  )
}

/**
 * Notifica le mail NUOVE arrivate in un account durante una sincronizzazione
 * (dopo l'istante `da`): solo posta in entrata, non letta, non nel cestino, non
 * spam. Una sola notifica riepilogativa.
 */
export async function notificaNuoveMail(utenteId: string, accountId: string, da: Date): Promise<void> {
  let nuove: { mittente: string; mittenteNome: string | null; oggetto: string }[] = []
  try {
    nuove = await db.messaggio.findMany({
      where: {
        utenteId,
        accountId,
        direzione: 'entrata',
        cestinato: false,
        letto: false,
        creatoIl: { gte: da },
        NOT: { smistatoDa: 'spam' },
      },
      orderBy: { data: 'desc' },
      take: 5,
      select: { mittente: true, mittenteNome: true, oggetto: true },
    })
  } catch {
    return
  }
  if (nuove.length === 0) return
  const primo = nuove[0]
  const chi = primo.mittenteNome || primo.mittente
  const titolo = nuove.length === 1 ? 'Nuova mail' : `${nuove.length} nuove mail`
  const corpo =
    nuove.length === 1 ? `${chi}: ${primo.oggetto}` : `${chi}: ${primo.oggetto} · e altre`
  await inviaPush(utenteId, { titolo, corpo, url: '/' })
}
