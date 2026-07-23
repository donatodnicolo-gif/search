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

export type PayloadPush = { titolo: string; corpo: string; url?: string; tag?: string }

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
 * Notifica le mail NUOVE di un account: posta in entrata, non letta, non nel
 * cestino, non spam, MAI notificata prima (`notificatoIl` = null).
 *
 * ⚠️ UNA notifica per OGNI mail (fino a un tetto), non un riepilogo: prima ne
 * arrivava una sola anche per dieci mail. Ogni notifica ha un `tag` diverso
 * (il messageId) così sul telefono si impilano invece di sostituirsi. E ogni
 * mail si marca `notificatoIl`, così un secondo giro (cron + interattivo) non
 * la rimanda.
 */
export async function notificaNuoveMail(utenteId: string, accountId: string, _da?: Date): Promise<void> {
  let nuove: { id: string; messageId: string | null; mittente: string; mittenteNome: string | null; oggetto: string }[] = []
  try {
    nuove = await db.messaggio.findMany({
      where: {
        utenteId,
        accountId,
        direzione: 'entrata',
        cestinato: false,
        letto: false,
        notificatoIl: null,
        NOT: { smistatoDa: 'spam' },
      },
      orderBy: { data: 'desc' },
      take: 10,
      select: { id: true, messageId: true, mittente: true, mittenteNome: true, oggetto: true },
    })
  } catch {
    return
  }
  if (nuove.length === 0) return

  // Fino a 5 notifiche singole; se sono di più, un riepilogo per il resto —
  // meglio che sommergere il telefono.
  const singole = nuove.slice(0, 5)
  for (const m of singole) {
    const chi = m.mittenteNome || m.mittente
    await inviaPush(utenteId, {
      titolo: chi,
      corpo: m.oggetto || '(senza oggetto)',
      url: `/messaggio/${m.id}`,
      tag: m.messageId || m.id, // tag diverso = notifiche che si impilano
    })
  }
  if (nuove.length > singole.length) {
    const resto = nuove.length - singole.length
    await inviaPush(utenteId, {
      titolo: `e altre ${resto} mail`,
      corpo: 'Apri AI Mail per vederle.',
      url: '/',
      tag: 'riepilogo',
    })
  }

  // Marcate come notificate: nessuna torna in un giro successivo.
  try {
    await db.messaggio.updateMany({
      where: { id: { in: nuove.map((m) => m.id) } },
      data: { notificatoIl: new Date() },
    })
  } catch {
    /* se non si riesce a marcare, al massimo si rinotifica: non è grave */
  }
}
