import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db } from './db'
import { cifra, decifra } from './crypto'

// Client di posta delle caselle aziendali. Se ne possono collegare più d'una
// (tabella CasellaEmail): le mail entrano nella stessa inbox degli altri
// canali, una Conversazione per mittente, e la risposta parte dalla casella
// che ha ricevuto.
//
// Parametri ufficiali register.it (www.register.it/assistenza/parametri-email):
//   IMAP  pop.securemail.pro       porta 993  SSL
//   SMTP  authsmtp.securemail.pro  porta 465  SSL
//   utente = indirizzo email completo
// Sono host GENERICI di register.it, non del dominio del cliente.
//
// Nota TLS: i server presentano un certificato che può non combaciare col nome
// usato. La connessione resta cifrata: si salta solo la verifica del NOME
// (stessa scelta di deluxy-mail).

export const IMAP_DEFAULT = 'pop.securemail.pro'
export const SMTP_DEFAULT = 'authsmtp.securemail.pro'

export type Casella = {
  id: string
  nome: string
  indirizzo: string
  nomeMittente: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSicuro: boolean
  ignoraCertTls: boolean
}

function decifraSicuro(v: string): string {
  if (!v) return ''
  try {
    return decifra(v)
  } catch {
    return '' // APP_SECRET cambiato: la password va reinserita
  }
}

type RigaCasella = {
  id: string
  nome: string
  indirizzo: string
  nomeMittente: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSicuro: boolean
  ignoraCertTls: boolean
}

function daRiga(r: RigaCasella): Casella {
  return { ...r, password: decifraSicuro(r.password) }
}

/** Caselle attive e utilizzabili (con password). */
export async function caselleAttive(): Promise<Casella[]> {
  const righe = await db.casellaEmail.findMany({
    where: { attiva: true },
    orderBy: [{ predefinita: 'desc' }, { indirizzo: 'asc' }],
  })
  return righe.map(daRiga).filter((c) => c.password)
}

/** Una casella per id; se manca, la predefinita (o la prima attiva). */
export async function casellaPerId(id: string): Promise<Casella | null> {
  if (id) {
    const r = await db.casellaEmail.findUnique({ where: { id } })
    if (r && r.attiva) {
      const c = daRiga(r)
      if (c.password) return c
    }
  }
  const attive = await caselleAttive()
  return attive[0] ?? null
}

/** Salva o aggiorna una casella. Password vuota = non toccare. */
export async function salvaCasella(
  id: string | null,
  dati: {
    nome: string
    indirizzo: string
    nomeMittente: string
    password?: string
    imapHost: string
    imapPort: number
    smtpHost: string
    smtpPort: number
    smtpSicuro: boolean
    predefinita?: boolean
  }
): Promise<void> {
  const base = {
    nome: dati.nome.trim(),
    indirizzo: dati.indirizzo.trim().toLowerCase(),
    nomeMittente: dati.nomeMittente.trim() || 'Deluxy',
    imapHost: dati.imapHost.trim() || IMAP_DEFAULT,
    imapPort: dati.imapPort || 993,
    smtpHost: dati.smtpHost.trim() || SMTP_DEFAULT,
    smtpPort: dati.smtpPort || 465,
    smtpSicuro: dati.smtpSicuro,
  }
  const conPassword = dati.password?.trim()
    ? { password: cifra(dati.password.trim()) }
    : {}

  const salvata = id
    ? await db.casellaEmail.update({ where: { id }, data: { ...base, ...conPassword } })
    : await db.casellaEmail.create({ data: { ...base, password: conPassword.password ?? '' } })

  // Una sola predefinita: le altre si spengono.
  if (dati.predefinita) {
    await db.casellaEmail.updateMany({
      where: { id: { not: salvata.id } },
      data: { predefinita: false },
    })
    await db.casellaEmail.update({ where: { id: salvata.id }, data: { predefinita: true } })
  }
}

function trasporto(c: Casella) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSicuro, // false = STARTTLS (tipico sulla 587)
    auth: { user: c.indirizzo, pass: c.password },
    ...(c.ignoraCertTls ? { tls: { rejectUnauthorized: false } } : {}),
  })
}

/** Invia una mail dalla casella indicata. */
export async function inviaEmail(
  c: Casella,
  a: string,
  oggetto: string,
  testo: string
): Promise<string> {
  const esito = await trasporto(c).sendMail({
    from: { name: c.nomeMittente, address: c.indirizzo },
    to: a,
    subject: oggetto || '(nessun oggetto)',
    text: testo,
  })
  return esito.messageId ?? ''
}

/** Prova SMTP e IMAP senza inviare nulla a nessuno. */
export async function provaCasella(c: Casella): Promise<{ ok: boolean; messaggio: string }> {
  try {
    await trasporto(c).verify()
  } catch (e) {
    return { ok: false, messaggio: `SMTP ${c.smtpHost}:${c.smtpPort} — ${(e as Error).message}` }
  }
  try {
    const client = connessioneImap(c)
    await client.connect()
    await client.logout().catch(() => {})
  } catch (e) {
    return {
      ok: false,
      messaggio: `SMTP ok, ma IMAP ${c.imapHost}:${c.imapPort} — ${(e as Error).message}`,
    }
  }
  return { ok: true, messaggio: `Invio e ricezione funzionano per ${c.indirizzo}.` }
}

function connessioneImap(c: Casella): ImapFlow {
  return new ImapFlow({
    host: c.imapHost,
    port: c.imapPort,
    secure: true,
    auth: { user: c.indirizzo, pass: c.password },
    logger: false,
    ...(c.ignoraCertTls ? { tls: { rejectUnauthorized: false } } : {}),
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

/** Scarica le mail recenti della posta in arrivo di una casella. */
export async function scaricaEmail(c: Casella, giorni = 7): Promise<EmailRicevuta[]> {
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
          idEsterno: m.messageId ?? `imap-${c.id}-${msg.uid}`,
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
