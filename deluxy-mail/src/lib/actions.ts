'use server'

import { revalidatePath } from 'next/cache'
import nodemailer from 'nodemailer'
import { db } from './db'
import { cifra, decifra } from './crypto'
import { scaricaStorico, sincronizzaTutti } from './sync'
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

    const scarichi = esiti.filter((e) => e.tipo === 'scarico')
    const nuovi = scarichi.reduce((s, e) => s + e.scaricati, 0)
    const recuperati = esiti.find((e) => e.tipo === 'rianalisi')
    const attivita = esiti.reduce((s, e) => s + e.attivitaCreate, 0)
    const bozze = esiti.reduce((s, e) => s + e.bozzeCreate, 0)
    const analizzati = esiti.reduce((s, e) => s + e.analizzati, 0)
    const nonAnalizzati = esiti.reduce((s, e) => s + e.scaricati, 0) - analizzati

    const parti: string[] = []
    if (nuovi > 0) parti.push(`${nuovi} messaggi nuovi`)
    if (recuperati?.analizzati) parti.push(`${recuperati.analizzati} recuperati`)
    if (attivita > 0) parti.push(`${attivita} attività`)
    if (bozze > 0) parti.push(`${bozze} bozze`)

    // Se l'AI non è riuscita su qualcuno, va detto: altrimenti sembra tutto a
    // posto e quei messaggi restano lì grezzi senza che nessuno se ne accorga.
    if (nonAnalizzati > 0) {
      parti.push(`${nonAnalizzati} senza analisi AI`)
      return {
        ok: false,
        messaggio: `${parti.join(' · ')}. Apri un messaggio col badge rosso per vedere l’errore.`,
      }
    }

    if (parti.length === 0) return { ok: true, messaggio: 'Nessun messaggio nuovo.' }
    return { ok: true, messaggio: `${parti.join(' · ')}.` }
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

    const nonAnalizzati = e.scaricati - e.analizzati
    const coda = e.finito ? ' Era l’ultimo blocco: la casella è tutta qui.' : ''
    const avviso = nonAnalizzati > 0 ? ` ${nonAnalizzati} senza analisi AI.` : ''
    return {
      ok: nonAnalizzati === 0,
      messaggio: `${e.scaricati} messaggi più vecchi scaricati.${avviso}${coda}`,
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
 * Priorità scelta a mano. Da qui in poi è tua: `prioritaDa: 'manuale'` fa sì
 * che una ri-analisi non te la sovrascriva.
 * Ripremere lo stesso livello la toglie, e la parola torna all'AI.
 */
export async function impostaPriorita(id: string, codice: string | null) {
  if (codice !== null && !CODICI_PRIORITA.includes(codice as never)) {
    throw new Error(`Priorità non valida: ${codice}`)
  }
  await db.messaggio.update({
    where: { id },
    data: { priorita: codice, prioritaDa: codice ? 'manuale' : null },
  })
  revalidatePath('/', 'layout')
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
