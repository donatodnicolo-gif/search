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

/**
 * Scarica i messaggi con UID successivo a `account.ultimoUid`.
 * Il limite evita che il primo collegamento a una casella con anni di posta
 * scarichi tutto in una volta: si riprende al sync successivo.
 */
export async function scaricaNuovi(
  account: Account,
  limite = 50
): Promise<{ messaggi: MessaggioScaricato[]; ultimoUid: number }> {
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
      if (msg.uid < daUid) continue
      if (messaggi.length >= limite) break
      if (!msg.source) continue // senza sorgente non c'è nulla da leggere

      // simpleParser ha anche un overload con callback: senza annotazione
      // esplicita TypeScript sceglie quello e il tipo del risultato si perde.
      const parsed: ParsedMail = await simpleParser(msg.source)
      const from = parsed.from?.value?.[0]
      const to: AddressObject[] = Array.isArray(parsed.to)
        ? parsed.to
        : parsed.to
          ? [parsed.to]
          : []
      const testo = (parsed.text ?? '').trim()

      messaggi.push({
        uid: msg.uid,
        messageId: parsed.messageId ?? null,
        thread: parsed.references
          ? [parsed.references].flat()[0]
          : (parsed.inReplyTo ?? parsed.messageId ?? null),
        mittente: from?.address ?? 'sconosciuto',
        mittenteNome: from?.name || null,
        destinatari: to
          .flatMap((t) => t.value.map((v) => v.address))
          .filter(Boolean)
          .join(', '),
        oggetto: parsed.subject ?? '(senza oggetto)',
        data: parsed.date ?? new Date(),
        anteprima: testo.replace(/\s+/g, ' ').slice(0, 200),
        corpoTesto: testo,
        corpoHtml: typeof parsed.html === 'string' ? parsed.html : null,
        allegati: parsed.attachments?.length ?? 0,
        letto: Boolean(msg.flags?.has('\\Seen')),
      })

      if (msg.uid > ultimoUid) ultimoUid = msg.uid
    }

    return { messaggi, ultimoUid }
  } finally {
    await client.logout()
  }
}
