import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { Account } from '@prisma/client'
import { decifra } from './crypto'
import { immaginiInLineaComeAllegati } from './htmlMail'

/**
 * SPEDIRE UNA MAIL: la primitiva, e una sola.
 *
 * ⚠️⚠️ Sta QUI e non in `actions.ts` per una ragione precisa: `actions.ts`
 * comincia con `'use server'`, e in un file cosi ogni funzione esportata
 * diventa una Server Action — cioe un indirizzo che chiunque puo chiamare da
 * fuori. Esportare da li una funzione che SPEDISCE POSTA, con destinatario e
 * testo fra i parametri, sarebbe stato aprire un endpoint per mandare mail a
 * nome delle caselle aziendali. Il codice che serve sia alle azioni sia alla
 * sincronia (la risposta di assenza, l'inoltro automatico) vive in un modulo
 * normale, e chi lo vuole se lo importa.
 *
 * ⚠️ Una casa sola anche per un altro motivo: la configurazione del server in
 * uscita (TLS, certificato da ignorare per register.it, password cifrata) e
 * una regola che non va ricopiata. Due copie diventano due comportamenti.
 */
export type AllegatoInvio = { filename: string; content: Buffer; contentType?: string }

export type DaInviare = {
  a: string
  cc?: string
  oggetto: string
  corpo: string // testo semplice (per il multipart text/plain e la traduzione)
  corpoHtml?: string // corpo formattato; se assente si invia solo testo
  allegati?: AllegatoInvio[]
  inRispostaA?: string | null
  /** Invito iCal (METHOD:REQUEST): fa comparire i Sì/No nativi nei client. */
  ics?: string
}

export async function spedisci(account: Account, m: DaInviare): Promise<{ raw: Buffer; messageId: string }> {
  // Le immagini incollate nel corpo diventano parti MIME con `cid:`, o non si
  // vedrebbero (vedi `immaginiInLineaComeAllegati`). Riguarda solo cio' che
  // parte: `m.corpoHtml` resta com era per la copia salvata in `registraInviato`.
  const inLinea = m.corpoHtml ? immaginiInLineaComeAllegati(m.corpoHtml) : null;
  const allegatiTutti = [...(m.allegati ?? []), ...(inLinea?.allegati ?? [])];
  const composer = new MailComposer({
    from: `${account.nome} <${account.email}>`,
    to: m.a,
    cc: m.cc || undefined,
    subject: m.oggetto,
    text: m.corpo,
    ...(inLinea ? { html: inLinea.html } : {}),
    ...(allegatiTutti.length ? { attachments: allegatiTutti } : {}),
    ...(m.ics ? { icalEvent: { method: 'REQUEST', content: m.ics } } : {}),
    inReplyTo: m.inRispostaA ?? undefined,
    references: m.inRispostaA ?? undefined,
  })

  const mail = composer.compile()
  const raw = await mail.build()
  const messageId = mail.messageId()

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSicuro,
    auth: { user: account.smtpUtente, pass: decifra(account.smtpPassword) },
    // Certificato per un altro dominio (register.it): salta la verifica del nome.
    ...(account.ignoraCertTls ? { tls: { rejectUnauthorized: false } } : {}),
  })
  await transporter.sendMail({
    envelope: { from: account.email, to: [m.a, ...(m.cc ? m.cc.split(',').map((x) => x.trim()) : [])] },
    raw,
  })

  return { raw, messageId }
}
