import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { leggiImpostazioni } from './impostazioni'

// Client di posta della casella aziendale (register.it): SMTP per inviare,
// IMAP per ricevere. Le mail entrano nella stessa inbox degli altri canali:
// una Conversazione per indirizzo email, come per WhatsApp c'è una
// conversazione per numero.
//
// Configurazione in Impostazioni (password cifrata in Impostazione):
//   emailIndirizzo, emailNome, emailPassword, emailImapHost, emailSmtpHost
//
// Nota su register.it: i suoi server presentano un certificato intestato a un
// altro dominio (securemail.pro). La connessione resta cifrata, ma va saltata
// la verifica del NOME sul certificato, altrimenti il collegamento fallisce.

const IMAP_DEFAULT = 'imaps.register.it'
const SMTP_DEFAULT = 'smtps.register.it'
const TLS_NOME_NON_VERIFICATO = { rejectUnauthorized: false }

export type ConfigEmail = {
  indirizzo: string
  nome: string
  password: string
  imapHost: string
  smtpHost: string
}

/** La configurazione della casella, o null se non è ancora impostata. */
export async function configEmail(): Promise<ConfigEmail | null> {
  const c = await leggiImpostazioni([
    'emailIndirizzo',
    'emailNome',
    'emailPassword',
    'emailImapHost',
    'emailSmtpHost',
  ])
  if (!c.emailIndirizzo || !c.emailPassword) return null
  return {
    indirizzo: c.emailIndirizzo,
    nome: c.emailNome || 'Deluxy',
    password: c.emailPassword,
    imapHost: c.emailImapHost || IMAP_DEFAULT,
    smtpHost: c.emailSmtpHost || SMTP_DEFAULT,
  }
}

function trasporto(c: ConfigEmail) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: 465,
    secure: true,
    auth: { user: c.indirizzo, pass: c.password },
    tls: TLS_NOME_NON_VERIFICATO,
  })
}

/** Invia una mail. `oggetto` vuoto = risposta senza oggetto nuovo. */
export async function inviaEmail(
  c: ConfigEmail,
  a: string,
  oggetto: string,
  testo: string
): Promise<string> {
  const esito = await trasporto(c).sendMail({
    from: { name: c.nome, address: c.indirizzo },
    to: a,
    subject: oggetto || '(nessun oggetto)',
    text: testo,
  })
  return esito.messageId ?? ''
}

/** Prova la connessione SMTP (bottone "Prova invio" nelle Impostazioni). */
export async function provaSmtp(c: ConfigEmail): Promise<{ ok: boolean; messaggio: string }> {
  try {
    await trasporto(c).verify()
    return { ok: true, messaggio: `SMTP ${c.smtpHost} raggiungibile, credenziali accettate.` }
  } catch (e) {
    return { ok: false, messaggio: (e as Error).message }
  }
}

function connessioneImap(c: ConfigEmail): ImapFlow {
  return new ImapFlow({
    host: c.imapHost,
    port: 993,
    secure: true,
    auth: { user: c.indirizzo, pass: c.password },
    logger: false,
    tls: TLS_NOME_NON_VERIFICATO,
  })
}

export type EmailRicevuta = {
  idEsterno: string // Message-ID: dedup
  da: string
  nome: string
  oggetto: string
  testo: string
  data: Date
}

/**
 * Scarica le mail recenti della posta in arrivo (ultimi `giorni` giorni).
 * Non tocca il server: le mail restano lì, qui se ne tiene una copia indicizzata.
 */
export async function scaricaEmail(c: ConfigEmail, giorni = 7): Promise<EmailRicevuta[]> {
  const client = connessioneImap(c)
  await client.connect()
  const out: EmailRicevuta[] = []
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const dal = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000)
      for await (const msg of client.fetch({ since: dal }, { source: true, envelope: true })) {
        if (!msg.source) continue
        const m = await simpleParser(msg.source)
        const mittente = m.from?.value?.[0]
        const indirizzo = (mittente?.address ?? '').toLowerCase()
        if (!indirizzo || indirizzo === c.indirizzo.toLowerCase()) continue // salta le proprie
        out.push({
          idEsterno: m.messageId ?? `imap-${msg.uid}`,
          da: indirizzo,
          nome: mittente?.name || indirizzo,
          oggetto: m.subject ?? '',
          testo: (m.text ?? '').trim().slice(0, 8000),
          data: m.date ?? new Date(),
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return out
}
