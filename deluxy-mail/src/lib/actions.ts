'use server'

import { revalidatePath } from 'next/cache'
import nodemailer from 'nodemailer'
import { db } from './db'
import { cifra, decifra } from './crypto'
import { analizzaMessaggioOra, scaricaStorico, sincronizzaTutti } from './sync'
import { CODICI_PRIORITA } from './format'
import { provaConnessione } from './imap'
import { scriviImpostazione } from './impostazioni'

function testo(form: FormData, campo: string): string {
  return String(form.get(campo) ?? '').trim()
}
function opzionale(form: FormData, campo: string): string | null {
  return testo(form, campo) || null
}
function flag(form: FormData, campo: string): boolean {
  return form.get(campo) === 'on' || form.get(campo) === 'true'
}

// ---------- Sincronizzazione ----------

export async function sincronizzaOra(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const esiti = await sincronizzaTutti()
    if (esiti.length === 0) {
      return { ok: false, messaggio: 'Nessuna casella collegata: aggiungila in Impostazioni.' }
    }
    revalidatePath('/', 'layout')

    const errori = esiti.filter((e) => e.errore)
    if (errori.length) {
      return { ok: false, messaggio: `Errore su ${errori[0].account}: ${errori[0].errore}` }
    }

    const nuovi = esiti.reduce((s, e) => s + e.scaricati, 0)
    const rimandati = esiti.reduce((s, e) => s + e.nonSalvati, 0)
    const scartati = esiti.reduce((s, e) => s + e.scartati, 0)

    const note: string[] = []
    if (rimandati > 0) note.push(`${rimandati} li riprendo al prossimo giro (database occupato)`)
    if (scartati > 0) note.push(`${scartati} scartati perché illeggibili`)
    const avviso = note.length ? ` ${note.join(', ')}.` : ''

    if (nuovi === 0) {
      return { ok: note.length === 0, messaggio: `Nessun messaggio nuovo.${avviso}` }
    }
    return {
      ok: note.length === 0,
      messaggio: `${nuovi} messaggi nuovi. Dai una priorità a quelli che contano: l’AI li analizza e crea le attività.${avviso}`,
    }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

/**
 * Scarica un blocco di posta vecchia. Si preme una volta per blocco: così
 * decidi tu quanto indietro andare, invece di ritrovarti anni di archivio
 * analizzati (e pagati) senza averlo chiesto.
 */
export async function scaricaStoricoOra(
  accountId: string,
  quanti = 25
): Promise<{ ok: boolean; messaggio: string; finito?: boolean }> {
  try {
    const e = await scaricaStorico(accountId, quanti)
    revalidatePath('/', 'layout')

    if (e.errore) return { ok: false, messaggio: `Errore: ${e.errore}` }
    if (e.finito && e.scaricati === 0) {
      return { ok: true, messaggio: 'Hai già tutta la casella: non c’è altro da scaricare.', finito: true }
    }

    const coda = e.finito ? ' Era l’ultimo blocco: la casella è tutta qui.' : ''
    return {
      ok: true,
      messaggio: `${e.scaricati} messaggi più vecchi scaricati.${coda}`,
      finito: e.finito,
    }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

// ---------- Messaggi ----------

export async function segnaLetto(id: string, letto: boolean) {
  await db.messaggio.update({ where: { id }, data: { letto } })
  revalidatePath('/', 'layout')
}

export async function archiviaMessaggio(id: string) {
  await db.messaggio.update({ where: { id }, data: { archiviato: true, letto: true } })
  revalidatePath('/', 'layout')
}

/**
 * "Archivia definitivo": archivia questo messaggio, tutti quelli già presenti
 * dello stesso mittente, e crea la regola che archivierà anche i prossimi.
 *
 * Niente viene cancellato: archiviato vuol dire fuori dalla posta in arrivo,
 * e la mail resta comunque intatta sul server IMAP. La regola è visibile e
 * spegnibile dalla pagina Regole, così la decisione si può sempre disfare.
 */
export async function archiviaDefinitivo(
  id: string
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const msg = await db.messaggio.findUniqueOrThrow({
      where: { id },
      select: { mittente: true },
    })

    // Una regola per mittente: premerlo due volte non ne crea due.
    const esistente = await db.regola.findFirst({
      where: { seMittente: msg.mittente, archivia: true },
    })
    if (!esistente) {
      await db.regola.create({
        data: {
          nome: `Archivia sempre: ${msg.mittente}`,
          // Priorità alta e fermaQui: se hai deciso che questo mittente non ti
          // interessa, non ha senso che altre regole lo smistino altrove.
          priorita: 200,
          seMittente: msg.mittente,
          archivia: true,
          segnaLetta: true,
          fermaQui: true,
        },
      })
    } else if (!esistente.attiva) {
      await db.regola.update({ where: { id: esistente.id }, data: { attiva: true } })
    }

    const arretrati = await db.messaggio.updateMany({
      where: { mittente: msg.mittente, archiviato: false },
      data: { archiviato: true, letto: true },
    })

    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio: `Archiviati ${arretrati.count} messaggi di ${msg.mittente}. I prossimi verranno archiviati da soli: la regola è in Regole, puoi spegnerla quando vuoi.`,
    }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

/**
 * Priorità scelta a mano — ed è questo il momento in cui l'AI entra in gioco.
 *
 * Dare una priorità significa "questo messaggio conta": solo allora vale la
 * pena spendere una chiamata al modello per farsi dire cosa c'è da fare e
 * caricarlo come attività. Sul resto della posta l'AI non gira, e non costa.
 *
 * Togliendo la priorità l'analisi resta: il lavoro è già stato pagato, e
 * l'attività magari l'hai già in mano.
 */
export async function impostaPriorita(
  id: string,
  codice: string | null
): Promise<{ ok: boolean; messaggio: string | null }> {
  if (codice !== null && !CODICI_PRIORITA.includes(codice as never)) {
    throw new Error(`Priorità non valida: ${codice}`)
  }

  await db.messaggio.update({
    where: { id },
    data: { priorita: codice, prioritaDa: codice ? 'manuale' : null },
  })

  if (!codice) {
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: null }
  }

  const esito = await analizzaMessaggioOra(id)
  revalidatePath('/', 'layout')
  return esito
}

/** Rilancia l'analisi di un messaggio: serve quando è andata storta. */
export async function rianalizza(id: string): Promise<{ ok: boolean; messaggio: string }> {
  const esito = await analizzaMessaggioOra(id)
  revalidatePath('/', 'layout')
  return esito
}

// ---------- Cestino ----------

/**
 * Il cestino è di AI Mail, non della casella: nasconde il messaggio qui, ma
 * sul server IMAP resta dov'era. È sempre reversibile finché non si svuota.
 */
export async function cestinaMessaggio(id: string) {
  await db.messaggio.update({
    where: { id },
    data: { cestinato: true, cestinatoIl: new Date(), letto: true },
  })
  revalidatePath('/', 'layout')
}

export async function ripristinaMessaggio(id: string) {
  await db.messaggio.update({
    where: { id },
    data: { cestinato: false, cestinatoIl: null, archiviato: false },
  })
  revalidatePath('/', 'layout')
}

/**
 * Svuota il cestino: cancella la copia locale dei messaggi cestinati.
 *
 * La mail vera resta sul server: se un domani rifai lo scarico dello storico,
 * quei messaggi tornano. Qui si perdono solo il lavoro dell'AI (riassunto,
 * attività, bozza) e la priorità che avevi messo.
 */
export async function svuotaCestino(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const r = await db.messaggio.deleteMany({ where: { cestinato: true } })
    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio: `Cestino svuotato: ${r.count} messaggi rimossi da AI Mail. Sul server della casella sono ancora lì.`,
    }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

export async function spostaInSezione(id: string, sezioneId: string | null) {
  // Spostamento manuale: da qui in poi la sezione l'hai decisa tu, non l'AI.
  await db.messaggio.update({
    where: { id },
    data: { sezioneId, smistatoDa: sezioneId ? 'manuale' : null },
  })
  revalidatePath('/', 'layout')
}

// ---------- Attività ----------

export async function segnaAttivita(id: string, fatta: boolean) {
  await db.attivita.update({
    where: { id },
    data: { fatta, fattaIl: fatta ? new Date() : null },
  })
  revalidatePath('/', 'layout')
}

export async function creaAttivitaManuale(form: FormData) {
  const scadenza = testo(form, 'scadenza')
  await db.attivita.create({
    data: {
      titolo: testo(form, 'titolo'),
      dettaglio: opzionale(form, 'dettaglio'),
      scadenza: scadenza ? new Date(scadenza) : null,
      priorita: testo(form, 'priorita') || 'media',
      creataDaAI: false,
    },
  })
  revalidatePath('/attivita')
}

export async function eliminaAttivita(id: string) {
  await db.attivita.delete({ where: { id } })
  revalidatePath('/attivita')
}

// ---------- Bozze ----------

export async function salvaBozza(id: string, oggetto: string, corpo: string) {
  const bozza = await db.bozza.findUniqueOrThrow({ where: { id } })
  await db.bozza.update({
    where: { id },
    data: { oggetto, corpo, modificata: corpo !== bozza.corpoAI },
  })
  revalidatePath('/', 'layout')
}

/**
 * Invia una bozza via SMTP. È l'unica azione che esce verso l'esterno e parte
 * solo da un click esplicito: l'AI scrive, tu mandi.
 */
export async function inviaBozza(id: string): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const bozza = await db.bozza.findUniqueOrThrow({
      where: { id },
      include: { messaggio: { include: { account: true } } },
    })
    if (bozza.inviata) return { ok: false, messaggio: 'Questa bozza è già stata inviata.' }

    const account = bozza.messaggio.account
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSicuro,
      auth: { user: account.smtpUtente, pass: decifra(account.smtpPassword) },
    })

    await transporter.sendMail({
      from: `${account.nome} <${account.email}>`,
      to: bozza.messaggio.mittente,
      subject: bozza.oggetto,
      text: bozza.corpo,
      inReplyTo: bozza.messaggio.messageId ?? undefined,
      references: bozza.messaggio.messageId ?? undefined,
    })

    await db.bozza.update({
      where: { id },
      data: { inviata: true, inviataIl: new Date() },
    })
    await db.messaggio.update({
      where: { id: bozza.messaggioId },
      data: { letto: true, serveRisposta: false },
    })

    revalidatePath('/', 'layout')
    return { ok: true, messaggio: `Risposta inviata a ${bozza.messaggio.mittente}.` }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Invio non riuscito' }
  }
}

// ---------- Scrivere e inviare ----------

/**
 * Invia una risposta, una risposta a tutti o un inoltro.
 *
 * Come per le bozze dell'AI, è l'utente a premere invia: qui non parte mai
 * niente da solo. Il messaggio esce dall'indirizzo della casella da cui è
 * arrivato l'originale, così il thread resta coerente.
 */
export async function inviaMessaggio(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const messaggioId = testo(form, 'messaggioId')
    const a = testo(form, 'a')
    const cc = testo(form, 'cc')
    const oggetto = testo(form, 'oggetto')
    const corpo = testo(form, 'corpo')

    if (!a) return { ok: false, messaggio: 'Manca il destinatario.' }
    if (!corpo) return { ok: false, messaggio: 'Il messaggio è vuoto.' }

    const originale = await db.messaggio.findUniqueOrThrow({
      where: { id: messaggioId },
      include: { account: true },
    })
    const account = originale.account

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSicuro,
      auth: { user: account.smtpUtente, pass: decifra(account.smtpPassword) },
    })

    const inoltro = testo(form, 'modo') === 'inoltra'

    await transporter.sendMail({
      from: `${account.nome} <${account.email}>`,
      to: a,
      cc: cc || undefined,
      subject: oggetto,
      text: corpo,
      // Un inoltro non appartiene alla conversazione originale: legarlo al
      // thread lo farebbe finire nella discussione sbagliata del destinatario.
      inReplyTo: inoltro ? undefined : (originale.messageId ?? undefined),
      references: inoltro ? undefined : (originale.messageId ?? undefined),
    })

    if (!inoltro) {
      await db.messaggio.update({
        where: { id: messaggioId },
        data: { letto: true, serveRisposta: false },
      })
    }

    revalidatePath('/', 'layout')
    return { ok: true, messaggio: `Messaggio inviato a ${a}.` }
  } catch (e) {
    return { ok: false, messaggio: `Invio non riuscito: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

// ---------- Sezioni ----------

export async function creaSezione(form: FormData) {
  const ultima = await db.sezione.findFirst({ orderBy: { ordine: 'desc' } })
  await db.sezione.create({
    data: {
      nome: testo(form, 'nome'),
      descrizione: testo(form, 'descrizione'),
      colore: testo(form, 'colore') || 'blue',
      ordine: (ultima?.ordine ?? 0) + 1,
    },
  })
  revalidatePath('/', 'layout')
}

export async function eliminaSezione(id: string) {
  await db.sezione.delete({ where: { id } })
  revalidatePath('/', 'layout')
}

// ---------- Regole ----------

export async function creaRegola(form: FormData) {
  await db.regola.create({
    data: {
      nome: testo(form, 'nome'),
      priorita: Number(testo(form, 'priorita') || 0),
      seMittente: opzionale(form, 'seMittente'),
      seOggetto: opzionale(form, 'seOggetto'),
      seContiene: opzionale(form, 'seContiene'),
      istruzioneAI: opzionale(form, 'istruzioneAI'),
      sezioneId: opzionale(form, 'sezioneId'),
      creaAttivita: flag(form, 'creaAttivita'),
      creaBozza: flag(form, 'creaBozza'),
      segnaLetta: flag(form, 'segnaLetta'),
      archivia: flag(form, 'archivia'),
      fermaQui: flag(form, 'fermaQui'),
    },
  })
  revalidatePath('/regole')
}

export async function attivaRegola(id: string, attiva: boolean) {
  await db.regola.update({ where: { id }, data: { attiva } })
  revalidatePath('/regole')
}

export async function eliminaRegola(id: string) {
  await db.regola.delete({ where: { id } })
  revalidatePath('/regole')
}

// ---------- Account ----------

export async function creaAccount(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const dati = {
      nome: testo(form, 'nome'),
      email: testo(form, 'email'),
      imapHost: testo(form, 'imapHost'),
      imapPort: Number(testo(form, 'imapPort') || 993),
      imapSicuro: true,
      imapUtente: testo(form, 'imapUtente') || testo(form, 'email'),
      imapPassword: cifra(testo(form, 'imapPassword')),
      smtpHost: testo(form, 'smtpHost'),
      smtpPort: Number(testo(form, 'smtpPort') || 465),
      smtpSicuro: true,
      smtpUtente: testo(form, 'smtpUtente') || testo(form, 'email'),
      smtpPassword: cifra(testo(form, 'smtpPassword') || testo(form, 'imapPassword')),
      cartella: testo(form, 'cartella') || 'INBOX',
    }

    // Meglio scoprire ora che host o password sono sbagliati, non al primo sync.
    await provaConnessione({ ...dati, id: '', ultimoUid: 0 } as never)

    const account = await db.account.create({ data: dati })
    revalidatePath('/impostazioni')
    return { ok: true, messaggio: `Casella ${account.email} collegata.` }
  } catch (e) {
    return {
      ok: false,
      messaggio: `Collegamento non riuscito: ${e instanceof Error ? e.message : 'errore'}`,
    }
  }
}

export async function eliminaAccount(id: string) {
  await db.account.delete({ where: { id } })
  revalidatePath('/impostazioni')
}

// ---------- Impostazioni ----------

export async function salvaImpostazioni(form: FormData) {
  await scriviImpostazione('contesto_azienda', testo(form, 'contestoAzienda'))
  await scriviImpostazione('firma', testo(form, 'firma'))
  revalidatePath('/impostazioni')
}
