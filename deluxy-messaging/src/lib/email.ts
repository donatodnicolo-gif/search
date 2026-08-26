import nodemailer from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db } from './db'
import { cifra, decifra } from './crypto'
import { normalizzaSpazi, testoDaHtml } from './html-a-testo'

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
  /** La firma di questa casella, aggiunta in coda alle mail che partono. */
  firma: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSicuro: boolean
  ignoraCertTls: boolean
  /**
   * A cosa serve questa casella: `posta` (le mail entrano in inbox) oppure
   * `chiamate` (notifiche del centralino, diventano righe in Chiamate).
   *
   * ⚠️⚠️ Senza questo campo le notifiche di `chiamate@deluxy.it` finirebbero
   * in inbox: una conversazione per ogni telefonata, con un corpo che nessuno
   * legge e un mittente che è il centralino, non il cliente.
   */
  tipo: string
  /** Il marchio della casella: l'ultimo appiglio per dare un brand a una chiamata. */
  negozioId: string | null
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
  firma: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  smtpSicuro: boolean
  ignoraCertTls: boolean
  tipo: string
  negozioId: string | null
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

/**
 * Le caselle da cui si può SCRIVERE.
 *
 * ⚠️⚠️ Non tutte le caselle attive: quella delle chiamate riceve le notifiche
 * del centralino e non è un indirizzo da cui parlare ai clienti. E il rischio
 * non è teorico — l'elenco è ordinato per indirizzo, e `chiamate@deluxy.it`
 * viene prima di `cs@deluxy.it`: senza questo filtro, il primo giorno in cui
 * nessuna casella fosse predefinita, le risposte ai clienti sarebbero partite
 * dall'indirizzo del centralino, e le loro risposte sarebbero finite dove
 * nessuno le legge.
 */
export async function caselleDaCuiScrivere(): Promise<Casella[]> {
  const attive = await caselleAttive()
  return attive.filter((c) => c.tipo !== 'chiamate')
}

/** Una casella per id; se manca, la predefinita (o la prima da cui si scrive). */
export async function casellaPerId(id: string): Promise<Casella | null> {
  if (id) {
    const r = await db.casellaEmail.findUnique({ where: { id } })
    if (r && r.attiva) {
      const c = daRiga(r)
      if (c.password) return c
    }
  }
  const scrivibili = await caselleDaCuiScrivere()
  return scrivibili[0] ?? null
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
    /** Il marchio della casella; stringa vuota = nessuno (serve a tutti). */
    negozioId?: string
    /** La firma in coda alle mail di questa casella. */
    firma?: string
    /** `posta` (default) o `chiamate`: vedi il campo `tipo` su Casella. */
    tipo?: string
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
    negozioId: dati.negozioId?.trim() ? dati.negozioId.trim() : null,
    firma: (dati.firma ?? '').trim().slice(0, 600),
    // ⚠️ Solo i due valori previsti: un `tipo` scritto storto («Chiamate»,
    // «call») farebbe ricadere la casella nel ramo della posta normale, e le
    // notifiche tornerebbero in inbox senza che nessuno abbia cambiato niente.
    tipo: dati.tipo === 'chiamate' ? 'chiamate' : 'posta',
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

/**
 * Il testo con la firma della casella in coda.
 *
 * ⚠️ Se il testo contiene già la firma non la si aggiunge una seconda volta: le
 * risposte pronte e l'AI a volte firmano da sole, e una mail che finisce con due
 * firme si nota subito. Il confronto è sulla PRIMA riga della firma, che è la
 * parte che non cambia («Servizio Clienti Deluxy»).
 */
export function conFirma(testo: string, firma: string): string {
  const f = (firma ?? '').trim()
  if (!f) return testo
  const primaRiga = f.split('\n')[0]?.trim()
  if (primaRiga && testo.includes(primaRiga)) return testo
  return `${testo.trimEnd()}\n\n${f}`
}

/** Invia una mail dalla casella indicata, firmata con la firma di quella casella. */
export async function inviaEmail(
  c: Casella,
  a: string,
  oggetto: string,
  testo: string,
  /**
   * Allegati già in memoria (nome + byte). Li prepara chi chiama: qui non si
   * scarica niente da internet, perché una libreria che va a prendere un URL
   * per conto di chi la chiama è un proxy aperto con un altro nome.
   */
  allegati?: { nome: string; contenuto: Buffer; tipo?: string }[]
): Promise<string> {
  const esito = await trasporto(c).sendMail({
    from: { name: c.nomeMittente, address: c.indirizzo },
    to: a,
    subject: oggetto || '(nessun oggetto)',
    text: conFirma(testo, c.firma),
    attachments: allegati?.length
      ? allegati.map((x) => ({ filename: x.nome, content: x.contenuto, contentType: x.tipo }))
      : undefined,
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

/**
 * Il corpo della mail, da qualunque parte arrivi.
 *
 * ⚠️⚠️ Prima qui c'era `(m.text ?? '').trim()`, e basta. Ma **una mail può non
 * avere affatto la parte `text/plain`**: chi la scrive con un editor visuale (o
 * la manda una piattaforma) spesso spedisce solo `text/html`. In quel caso
 * `m.text` è `undefined` e il messaggio finiva in archivio **con il corpo
 * vuoto**: in Inbox e nella scheda dell'ordine restava l'oggetto e sotto il
 * nulla, come se il cliente avesse mandato una mail bianca. E non era solo
 * questione di aspetto: `linguaDelTesto('')` non riconosce niente, e l'AI che
 * legge quelle conversazioni leggeva una riga vuota.
 *
 * Misurato sul database il 25/08/2026: **36 mail su 1.240** erano così — fra
 * cui le due «Re: ORDER 2798» da cui è partita la segnalazione.
 *
 * L'HTML si usa solo come ripiego, e ridotto a testo: qui non si conserva
 * impaginato: quello resta sul server IMAP.
 */
export function corpoDellaMail(text: string | undefined, html: string | false | undefined): string {
  const semplice = (text ?? '').trim()
  if (semplice) return semplice.slice(0, 8000)
  if (typeof html === 'string' && html.trim()) {
    return normalizzaSpazi(testoDaHtml(html)).slice(0, 8000)
  }
  return ''
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
          testo: corpoDellaMail(m.text, m.html),
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
