import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser'
import type { Account } from '@prisma/client'
import { decifra } from './crypto'

export type MessaggioScaricato = {
  uid: number
  messageId: string | null
  thread: string | null
  mittente: string
  mittenteNome: string | null
  destinatari: string
  oggetto: string
  data: Date
  anteprima: string
  corpoTesto: string
  corpoHtml: string | null
  allegati: number
  letto: boolean
}

// Entità HTML con nome che capitano davvero nella posta italiana. Le accentate
// non sono un dettaglio: senza, "Nicolò" arriva all'AI come "Nicol&ograve;".
const ENTITA: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  euro: '€',
  agrave: 'à',
  egrave: 'è',
  eacute: 'é',
  igrave: 'ì',
  ograve: 'ò',
  ugrave: 'ù',
  ccedil: 'ç',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  deg: '°',
  copy: '©',
  reg: '®',
  trade: '™',
}

// Caratteri che Postgres non accetta in una colonna di testo. Il byte NULL è
// il vero problema: una sola occorrenza fa rifiutare la scrittura e chiudere
// la connessione ("unexpected message from server"). Capita davvero — le mail
// promozionali con HTML generato male ne contengono — e senza ripulirle un
// singolo messaggio blocca lo scarico di tutti quelli dopo di lui.
// Si tengono \t \n \r, che sono testo legittimo.
const CONTROLLO = new RegExp(
  '[' +
    String.fromCharCode(0) +
    '-' +
    String.fromCharCode(8) +
    String.fromCharCode(11) +
    String.fromCharCode(12) +
    String.fromCharCode(14) +
    '-' +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    ']',
  'g'
)

/** Toglie i caratteri che il database non può memorizzare. */
export function ripulisciPerDatabase(testo: string): string {
  return testo.replace(CONTROLLO, '')
}

/** Vero se il "testo" è in realtà markup: CSS, tag HTML, commenti condizionali. */
function sembraMarkup(testo: string): boolean {
  const inizio = testo.slice(0, 500)
  return /\{[^}]*:[^}]*\}|<\/?[a-z][^>]*>|<!--/i.test(inizio)
}

/**
 * Ricava il testo leggibile di una mail.
 *
 * Molti mailer transazionali (Shopify in testa) mandano un text/plain che è
 * solo l'HTML ricopiato, CSS compreso. Darlo all'AI così com'è significa
 * pagare migliaia di token di fogli di stile e farle analizzare rumore, quindi
 * quando il testo sembra markup lo si ricostruisce ripulendo l'HTML.
 */
export function testoLeggibile(testo: string | undefined, html: string | false | undefined): string {
  const grezzo = (testo ?? '').trim()
  if (grezzo && !sembraMarkup(grezzo)) return grezzo

  const sorgente = typeof html === 'string' && html ? html : grezzo
  if (!sorgente) return ''

  const pulito = sorgente
    // Via i blocchi che non sono contenuto: stile, script, testa, commenti.
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // A capo dove l'HTML andava a capo davvero, così le righe restano leggibili.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // Entità: prima le numeriche (&#233; &#xE9;), poi quelle con nome.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    // &Agrave; e &agrave; sono lettere diverse: si prova prima il nome esatto,
    // e solo se non c'è si ricade sulla versione minuscola.
    .replace(
      /&([a-z]+);/gi,
      (intera, nome: string) =>
        ENTITA[nome] ??
        (ENTITA[nome.toLowerCase()] ? ENTITA[nome.toLowerCase()].toUpperCase() : intera)
    )
    // Un blocco CSS sopravvissuto (selettore { proprietà: valore }).
    .replace(/[^\n{}]*\{[^{}]*:[^{}]*\}/g, ' ')
    // Spazi e righe vuote in eccesso.
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((r) => r.trim())
    .join('\n')
    .trim()

  return pulito
}

function connessione(account: Account): ImapFlow {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSicuro,
    auth: { user: account.imapUtente, pass: decifra(account.imapPassword) },
    logger: false,
  })
}

/** Apre e chiude una connessione per verificare host, porta e credenziali. */
export async function provaConnessione(account: Account): Promise<void> {
  const client = connessione(account)
  await client.connect()
  try {
    await client.mailboxOpen(account.cartella, { readOnly: true })
  } finally {
    await client.logout()
  }
}

/** Trasforma un messaggio IMAP grezzo nella forma che usa il resto dell'app. */
async function converti(uid: number, source: Buffer, letto: boolean): Promise<MessaggioScaricato> {
  // simpleParser ha anche un overload con callback: senza annotazione esplicita
  // TypeScript sceglie quello e il tipo del risultato si perde.
  const parsed: ParsedMail = await simpleParser(source)
  const from = parsed.from?.value?.[0]
  const to: AddressObject[] = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []
  const testo = ripulisciPerDatabase(testoLeggibile(parsed.text, parsed.html))
  const html = typeof parsed.html === 'string' ? ripulisciPerDatabase(parsed.html) : null

  return {
    uid,
    messageId: parsed.messageId ?? null,
    thread: parsed.references
      ? [parsed.references].flat()[0]
      : (parsed.inReplyTo ?? parsed.messageId ?? null),
    mittente: from?.address ?? 'sconosciuto',
    mittenteNome: from?.name ? ripulisciPerDatabase(from.name) : null,
    destinatari: to
      .flatMap((t) => t.value.map((v) => v.address))
      .filter(Boolean)
      .join(', '),
    oggetto: ripulisciPerDatabase(parsed.subject ?? '(senza oggetto)'),
    data: parsed.date ?? new Date(),
    anteprima: testo.replace(/\s+/g, ' ').slice(0, 200),
    corpoTesto: testo,
    corpoHtml: html,
    allegati: parsed.attachments?.length ?? 0,
    letto,
  }
}

/**
 * Scarica lo storico: i messaggi PRECEDENTI a quelli che abbiamo già
 * (UID < primoUid), dal più recente andando indietro, a blocchi.
 *
 * Serve perché il primo collegamento prende solo la posta recente: da qui si
 * recupera il resto della casella quando lo si chiede, un blocco alla volta.
 */
export async function scaricaVecchi(
  account: Account,
  limite = 25
): Promise<{ messaggi: MessaggioScaricato[]; primoUid: number; finito: boolean }> {
  if (account.primoUid <= 1) {
    return { messaggi: [], primoUid: account.primoUid, finito: true }
  }

  const client = connessione(account)
  await client.connect()

  try {
    await client.mailboxOpen(account.cartella, { readOnly: true })

    // search dice quali UID esistono davvero: la numerazione ha buchi dove i
    // messaggi sono stati cancellati, quindi non si può contare a ritroso.
    const esistenti = await client.search({ uid: `1:${account.primoUid - 1}` }, { uid: true })
    if (!esistenti || esistenti.length === 0) {
      return { messaggi: [], primoUid: account.primoUid, finito: true }
    }

    // I più recenti fra i vecchi: gli ultimi della lista.
    const daPrendere = esistenti.slice(-limite)
    const messaggi: MessaggioScaricato[] = []

    for await (const msg of client.fetch(
      daPrendere.join(','),
      { uid: true, source: true, flags: true },
      { uid: true }
    )) {
      if (!msg.source) continue
      messaggi.push(await converti(msg.uid, msg.source, Boolean(msg.flags?.has('\\Seen'))))
    }

    const primoUid = Math.min(...daPrendere)
    return { messaggi, primoUid, finito: daPrendere.length === esistenti.length }
  } finally {
    await client.logout()
  }
}

/**
 * Scarica i messaggi con UID successivo a `account.ultimoUid`.
 * Il limite evita che il primo collegamento a una casella con anni di posta
 * scarichi tutto in una volta: si riprende al sync successivo.
 */
export async function scaricaNuovi(
  account: Account,
  limite = 50
): Promise<{ messaggi: MessaggioScaricato[]; ultimoUid: number; primoUid: number }> {
  const client = connessione(account)
  await client.connect()

  try {
    const mailbox = await client.mailboxOpen(account.cartella, { readOnly: true })
    const messaggi: MessaggioScaricato[] = []
    let ultimoUid = account.ultimoUid

    // Prima sincronizzazione: partiamo dagli ultimi `limite` messaggi invece
    // che dall'inizio della casella.
    const daUid =
      account.ultimoUid > 0 ? account.ultimoUid + 1 : Math.max(1, (mailbox.uidNext ?? 1) - limite)

    for await (const msg of client.fetch(
      { uid: `${daUid}:*` },
      { uid: true, source: true, flags: true, envelope: true },
      { uid: true }
    )) {
      // `uid:daUid:*` restituisce comunque l'ultimo messaggio anche quando non
      // ce ne sono di nuovi: lo scartiamo esplicitamente.
      // `uid:daUid:*` restituisce comunque l'ultimo messaggio anche quando non
      // ce ne sono di nuovi: lo scartiamo esplicitamente.
      if (msg.uid < daUid) continue
      if (messaggi.length >= limite) break
      if (!msg.source) continue // senza sorgente non c'è nulla da leggere

      messaggi.push(await converti(msg.uid, msg.source, Boolean(msg.flags?.has('\\Seen'))))
      if (msg.uid > ultimoUid) ultimoUid = msg.uid
    }

    // Il più vecchio di questo giro apre la strada allo scarico dello storico.
    const primoUid = messaggi.length ? Math.min(...messaggi.map((m) => m.uid)) : 0

    return { messaggi, ultimoUid, primoUid }
  } finally {
    await client.logout()
  }
}
