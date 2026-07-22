// SEQUENZE di follow-up: all'invio di una mail il destinatario viene iscritto
// a una sequenza; se non risponde, i passi successivi partono da soli (dal
// cron), ognuno dopo la sua attesa. Se risponde, la sequenza si ferma da sé.
//
// I testi dei passi sono MODELLI con variabili:
//   {{nome}}    → il nome del destinatario (dalla rubrica o dall'indirizzo)
//   {{email}}   → l'indirizzo del destinatario
//   {{oggetto}} → l'oggetto della mail iniziale

import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { Account } from '@prisma/client'
import { db } from './db'
import { decifra } from './crypto'
import { salvaInInviata, trovaCartellaInviata } from './imap'
import { plainAHtml, sembraHtml } from './htmlMail'

export type VariabiliSequenza = { nome: string; email: string; oggetto: string }

/** Sostituisce le variabili {{...}} nel modello. Le sconosciute restano com'erano. */
export function sostituisciVariabili(modello: string, v: VariabiliSequenza): string {
  return modello
    .replace(/\{\{\s*nome\s*\}\}/gi, v.nome)
    .replace(/\{\{\s*email\s*\}\}/gi, v.email)
    .replace(/\{\{\s*oggetto\s*\}\}/gi, v.oggetto)
}

/** Un nome presentabile dal solo indirizzo ("mario.rossi@x.it" → "Mario"). */
export function nomeDaEmail(email: string): string {
  const base = email.split('@')[0] ?? ''
  const primo = base.split(/[._-]/)[0] ?? ''
  return primo ? primo[0].toUpperCase() + primo.slice(1) : email
}

/** Invio "grezzo" di un passo: come le altre mail (SMTP + copia in Inviata +
 *  riga in Posta inviata), ma senza passare dalle Server Actions. */
async function inviaPasso(
  account: Account,
  opts: { a: string; oggetto: string; corpo: string; firma: string; thread: string | null }
): Promise<void> {
  // La firma dell'utente in coda, come nelle mail scritte a mano.
  const firmaHtml = opts.firma ? (sembraHtml(opts.firma) ? opts.firma : plainAHtml(opts.firma)) : ''
  const corpoHtml = `${plainAHtml(opts.corpo)}${firmaHtml ? `<br>${firmaHtml}` : ''}`
  const corpoTesto = `${opts.corpo}${opts.firma && !sembraHtml(opts.firma) ? `\n\n${opts.firma}` : ''}`

  const composer = new MailComposer({
    from: `${account.nome} <${account.email}>`,
    to: opts.a,
    subject: opts.oggetto,
    text: corpoTesto,
    html: corpoHtml,
  })
  const mail = composer.compile()
  const raw = await mail.build()
  const messageId = mail.messageId()

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSicuro,
    auth: { user: account.smtpUtente, pass: decifra(account.smtpPassword) },
    ...(account.ignoraCertTls ? { tls: { rejectUnauthorized: false } } : {}),
  })
  await transporter.sendMail({ envelope: { from: account.email, to: [opts.a] }, raw })

  // Copia nella cartella "Inviata" del server (best-effort).
  try {
    let cartella = account.cartellaInviata
    if (!cartella) {
      cartella = await trovaCartellaInviata(account)
      if (cartella) await db.account.update({ where: { id: account.id }, data: { cartellaInviata: cartella } })
    }
    if (cartella) await salvaInInviata(account, cartella, raw)
  } catch {
    /* la copia sul server è di cortesia */
  }

  // La riga in Posta inviata (uid negativo come le altre mail spedite da qui).
  const ultimo = await db.messaggio.findFirst({
    where: { accountId: account.id, direzione: 'uscita' },
    orderBy: { uid: 'asc' },
    select: { uid: true },
  })
  await db.messaggio.create({
    data: {
      utenteId: account.utenteId,
      accountId: account.id,
      uid: Math.min(-1, (ultimo?.uid ?? 0) - 1),
      direzione: 'uscita',
      messageId,
      thread: opts.thread,
      mittente: account.email,
      mittenteNome: account.nome,
      destinatari: opts.a,
      oggetto: opts.oggetto,
      data: new Date(),
      anteprima: corpoTesto.replace(/\s+/g, ' ').slice(0, 200),
      corpoTesto,
      corpoHtml,
      letto: true,
    },
  })
}

const GIORNO = 24 * 60 * 60 * 1000
// Finito il percorso A senza risposta, per quanti giorni si continua a
// controllare una risposta per far scattare il percorso B.
const FINESTRA_RISPOSTA_GIORNI = 21

const fra = (giorni: number) => new Date(Date.now() + Math.max(0, giorni) * GIORNO)

/**
 * Il giro delle sequenze (dal cron): fa avanzare le iscrizioni mature.
 *
 * Percorsi:
 *  - Ramo A ("se non risponde"): i follow-up partono a scadenza finché il
 *    destinatario non risponde.
 *  - Ramo B ("se risponde"): appena arriva una risposta, si passa a questo
 *    ramo e partono i suoi passi (al posto del follow-up).
 *  Senza passi B, la risposta ferma semplicemente la sequenza.
 */
export async function processaSequenze(): Promise<{ inviati: number }> {
  let daFare: {
    id: string
    utenteId: string
    sequenzaId: string
    destinatario: string
    nomeDestinatario: string
    oggettoIniziale: string
    thread: string | null
    passoFatto: number
    ramo: string
    creataIl: Date
  }[] = []
  try {
    daFare = await db.sequenzaIscrizione.findMany({
      where: { stato: 'attiva', prossimoInvio: { lte: new Date() } },
      orderBy: { prossimoInvio: 'asc' },
      take: 20,
    })
  } catch {
    return { inviati: 0 } // tabelle non ancora migrate
  }

  let inviati = 0
  for (const isc of daFare) {
    try {
      const passi = await db.sequenzaPasso.findMany({
        where: { sequenzaId: isc.sequenzaId },
        orderBy: { ordine: 'asc' },
      })
      const passiA = passi.filter((p) => p.ramo !== 'B')
      const passiB = passi.filter((p) => p.ramo === 'B')

      const [account, utente] = await Promise.all([
        db.account.findFirst({ where: { utenteId: isc.utenteId, attivo: true } }),
        db.utente.findUnique({ where: { id: isc.utenteId }, select: { firma: true } }),
      ])
      if (!account) {
        await db.sequenzaIscrizione.update({
          where: { id: isc.id },
          data: { stato: 'fermata', esito: 'Nessuna casella collegata.', prossimoInvio: null },
        })
        continue
      }

      const variabili: VariabiliSequenza = {
        nome: isc.nomeDestinatario || nomeDaEmail(isc.destinatario),
        email: isc.destinatario,
        oggetto: isc.oggettoIniziale,
      }
      const manda = async (p: { oggetto: string; corpo: string }) => {
        await inviaPasso(account, {
          a: isc.destinatario,
          oggetto: sostituisciVariabili(p.oggetto, variabili),
          corpo: sostituisciVariabili(p.corpo, variabili),
          firma: utente?.firma ?? '',
          thread: isc.thread,
        })
        inviati++
      }

      // --- Ramo B: il destinatario ha già risposto, si svolgono i suoi passi. ---
      if (isc.ramo === 'B') {
        const p = passiB[isc.passoFatto]
        if (!p) {
          await db.sequenzaIscrizione.update({
            where: { id: isc.id },
            data: { stato: 'completata', esito: 'Percorso B completato.', prossimoInvio: null },
          })
          continue
        }
        await manda(p)
        const prossimo = passiB[isc.passoFatto + 1]
        await db.sequenzaIscrizione.update({
          where: { id: isc.id },
          data: prossimo
            ? { passoFatto: isc.passoFatto + 1, prossimoInvio: fra(prossimo.giorniAttesa) }
            : { passoFatto: isc.passoFatto + 1, stato: 'completata', esito: 'Percorso B completato.', prossimoInvio: null },
        })
        continue
      }

      // --- Ramo A: prima si guarda se il destinatario ha RISPOSTO. ---
      const risposta = await db.messaggio.findFirst({
        where: {
          utenteId: isc.utenteId,
          direzione: 'entrata',
          cestinato: false,
          mittente: { equals: isc.destinatario, mode: 'insensitive' },
          data: { gt: isc.creataIl },
        },
        select: { id: true },
      })
      if (risposta) {
        if (passiB.length > 0) {
          // Passa al percorso B: parte il primo passo dopo la sua attesa.
          await db.sequenzaIscrizione.update({
            where: { id: isc.id },
            data: { ramo: 'B', passoFatto: 0, prossimoInvio: fra(passiB[0].giorniAttesa), esito: 'Ha risposto: avviato il percorso B.' },
          })
        } else {
          await db.sequenzaIscrizione.update({
            where: { id: isc.id },
            data: { stato: 'fermata', esito: 'Il destinatario ha risposto: sequenza fermata.', prossimoInvio: null },
          })
        }
        continue
      }

      // Nessuna risposta: il prossimo passo A (se c'è).
      const pA = passiA[isc.passoFatto]
      if (!pA) {
        // Percorso A esaurito. Se c'è un percorso B, si continua a controllare
        // una risposta per un po' (potrebbe ancora arrivare); poi si completa.
        const scadenza = new Date(isc.creataIl.getTime() + FINESTRA_RISPOSTA_GIORNI * GIORNO)
        if (passiB.length > 0 && new Date() < scadenza) {
          await db.sequenzaIscrizione.update({ where: { id: isc.id }, data: { prossimoInvio: fra(2) } })
        } else {
          await db.sequenzaIscrizione.update({
            where: { id: isc.id },
            data: { stato: 'completata', esito: 'Nessuna risposta: percorso A concluso.', prossimoInvio: null },
          })
        }
        continue
      }

      await manda(pA)
      const prossimoA = passiA[isc.passoFatto + 1]
      if (prossimoA) {
        await db.sequenzaIscrizione.update({
          where: { id: isc.id },
          data: { passoFatto: isc.passoFatto + 1, prossimoInvio: fra(prossimoA.giorniAttesa) },
        })
      } else if (passiB.length > 0) {
        // Finito A ma c'è B: si resta attivi per intercettare una risposta.
        await db.sequenzaIscrizione.update({
          where: { id: isc.id },
          data: { passoFatto: isc.passoFatto + 1, prossimoInvio: fra(2) },
        })
      } else {
        await db.sequenzaIscrizione.update({
          where: { id: isc.id },
          data: { passoFatto: isc.passoFatto + 1, stato: 'completata', esito: 'Nessuna risposta: percorso A concluso.', prossimoInvio: null },
        })
      }
    } catch (e) {
      // Un'iscrizione rotta non blocca le altre: si segna e si va avanti.
      await db.sequenzaIscrizione
        .update({
          where: { id: isc.id },
          data: { esito: `Invio non riuscito: ${e instanceof Error ? e.message : 'errore'}`.slice(0, 200) },
        })
        .catch(() => {})
    }
  }

  return { inviati }
}
