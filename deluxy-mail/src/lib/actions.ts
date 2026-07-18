'use server'

import { revalidatePath } from 'next/cache'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { Account } from '@prisma/client'
import { db } from './db'
import { cifra, decifra } from './crypto'
import {
  analizzaContattoOra,
  analizzaMessaggioOra,
  leggiQuadroContatto,
  preparaEsecuzione,
  scaricaStorico,
  sincronizzaUtente,
  type QuadroContatto,
} from './sync'
import { CODICI_PRIORITA } from './format'
import { traduciVerso } from './ai'
import { provaConnessione, salvaInInviata, trovaCartellaInviata } from './imap'
import { scriviImpostazione } from './impostazioni'
import { utenteCorrente } from './sessione'

function testo(form: FormData, campo: string): string {
  return String(form.get(campo) ?? '').trim()
}
function opzionale(form: FormData, campo: string): string | null {
  return testo(form, campo) || null
}
function flag(form: FormData, campo: string): boolean {
  return form.get(campo) === 'on' || form.get(campo) === 'true'
}

/** L'utente della sessione, o errore. Il middleware garantisce che ci sia. */
async function uid(): Promise<string> {
  const u = await utenteCorrente()
  if (!u) throw new Error('Sessione scaduta: rientra.')
  return u.id
}

// ---------- Sincronizzazione ----------

export async function sincronizzaOra(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const esiti = await sincronizzaUtente(await uid())
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

    if (nuovi === 0) return { ok: note.length === 0, messaggio: `Nessun messaggio nuovo.${avviso}` }
    return {
      ok: note.length === 0,
      messaggio: `${nuovi} messaggi nuovi. Dai una priorità a quelli che contano: l’AI li analizza e crea le attività.${avviso}`,
    }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

export async function scaricaStoricoOra(
  accountId: string,
  quanti = 25
): Promise<{ ok: boolean; messaggio: string; finito?: boolean }> {
  try {
    // La casella dev'essere dell'utente.
    const mio = await db.account.findFirst({ where: { id: accountId, utenteId: await uid() } })
    if (!mio) return { ok: false, messaggio: 'Casella non trovata.' }

    const e = await scaricaStorico(accountId, quanti)
    revalidatePath('/', 'layout')

    if (e.errore) return { ok: false, messaggio: `Errore: ${e.errore}` }
    if (e.finito && e.scaricati === 0) {
      return { ok: true, messaggio: 'Hai già tutta la casella: non c’è altro da scaricare.', finito: true }
    }
    const coda = e.finito ? ' Era l’ultimo blocco: la casella è tutta qui.' : ''
    return { ok: true, messaggio: `${e.scaricati} messaggi più vecchi scaricati.${coda}`, finito: e.finito }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

// ---------- Messaggi ----------

export async function segnaLetto(id: string, letto: boolean) {
  await db.messaggio.updateMany({ where: { id, utenteId: await uid() }, data: { letto } })
  revalidatePath('/', 'layout')
}

export async function archiviaMessaggio(id: string) {
  await db.messaggio.updateMany({
    where: { id, utenteId: await uid() },
    data: { archiviato: true, letto: true },
  })
  revalidatePath('/', 'layout')
}

export async function archiviaDefinitivo(id: string): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const utenteId = await uid()
    const msg = await db.messaggio.findFirst({ where: { id, utenteId }, select: { mittente: true } })
    if (!msg) return { ok: false, messaggio: 'Messaggio non trovato.' }

    const esistente = await db.regola.findFirst({
      where: { utenteId, seMittente: msg.mittente, archivia: true },
    })
    if (!esistente) {
      await db.regola.create({
        data: {
          utenteId,
          nome: `Archivia sempre: ${msg.mittente}`,
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
      where: { utenteId, mittente: msg.mittente, archiviato: false },
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

export async function impostaPriorita(
  id: string,
  codice: string | null
): Promise<{ ok: boolean; messaggio: string | null }> {
  if (codice !== null && !CODICI_PRIORITA.includes(codice as never)) {
    throw new Error(`Priorità non valida: ${codice}`)
  }
  const utenteId = await uid()
  await db.messaggio.updateMany({
    where: { id, utenteId },
    data: { priorita: codice, prioritaDa: codice ? 'manuale' : null },
  })

  if (!codice) {
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: null }
  }

  const esito = await analizzaMessaggioOra(id, utenteId)
  revalidatePath('/', 'layout')
  return esito
}

export async function analizzaContatto(
  email: string,
  rifai = false
): Promise<{ ok: boolean; messaggio: string; quadro?: QuadroContatto }> {
  const utenteId = await uid()
  if (!rifai) {
    const salvato = await leggiQuadroContatto(utenteId, email)
    if (salvato) return { ok: true, messaggio: `Letti ${salvato.messaggiVisti} messaggi.`, quadro: salvato }
  }
  const esito = await analizzaContattoOra(utenteId, email)
  revalidatePath('/', 'layout')
  return esito
}

export async function eseguiAttivita(
  id: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const esito = await preparaEsecuzione(id, await uid())
  revalidatePath('/', 'layout')
  return esito
}

export async function rianalizza(id: string): Promise<{ ok: boolean; messaggio: string }> {
  const esito = await analizzaMessaggioOra(id, await uid())
  revalidatePath('/', 'layout')
  return esito
}

// ---------- Assistente AI ----------

export async function contaPeriodoAI(periodo: string): Promise<{ totale: number; daLavorare: number }> {
  const { contaPeriodo, periodoValido } = await import('./assistente')
  return contaPeriodo(await uid(), periodoValido(periodo), new Date())
}

export async function avviaAssistenteAI(
  periodo: string
): Promise<{ ok: boolean; messaggio: string; rapportoId?: string }> {
  const { eseguiAssistente, periodoValido } = await import('./assistente')
  const esito = await eseguiAssistente(await uid(), periodoValido(periodo), new Date())
  revalidatePath('/', 'layout')
  return esito
}

export async function applicaArchiviazioni(ids: string[]): Promise<{ ok: boolean; messaggio: string }> {
  if (ids.length === 0) return { ok: false, messaggio: 'Non hai selezionato niente.' }
  const utenteId = await uid()

  // Solo proposte su messaggi dell'utente.
  const proposte = await db.propostaArchivio.findMany({
    where: { id: { in: ids }, applicata: false, messaggio: { utenteId } },
    select: { id: true, messaggioId: true },
  })

  for (const p of proposte) {
    await db.messaggio.updateMany({
      where: { id: p.messaggioId, utenteId },
      data: { archiviato: true, letto: true },
    })
    await db.propostaArchivio.update({ where: { id: p.id }, data: { applicata: true } })
  }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    messaggio: `Archiviati ${proposte.length} messaggi. Sono negli Archiviati, e restano sul server.`,
  }
}

// ---------- Cestino ----------

export async function cestinaMessaggio(id: string) {
  await db.messaggio.updateMany({
    where: { id, utenteId: await uid() },
    data: { cestinato: true, cestinatoIl: new Date(), letto: true },
  })
  revalidatePath('/', 'layout')
}

export async function ripristinaMessaggio(id: string) {
  await db.messaggio.updateMany({
    where: { id, utenteId: await uid() },
    data: { cestinato: false, cestinatoIl: null, archiviato: false },
  })
  revalidatePath('/', 'layout')
}

export async function svuotaCestino(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const r = await db.messaggio.deleteMany({ where: { cestinato: true, utenteId: await uid() } })
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
  const utenteId = await uid()
  // La sezione, se indicata, dev'essere dell'utente.
  if (sezioneId) {
    const mia = await db.sezione.findFirst({ where: { id: sezioneId, utenteId } })
    if (!mia) return
  }
  await db.messaggio.updateMany({
    where: { id, utenteId },
    data: { sezioneId, smistatoDa: sezioneId ? 'manuale' : null },
  })
  revalidatePath('/', 'layout')
}

// ---------- Attività ----------

export async function segnaAttivita(id: string, fatta: boolean) {
  await db.attivita.updateMany({
    where: { id, utenteId: await uid() },
    data: { fatta, fattaIl: fatta ? new Date() : null },
  })
  revalidatePath('/', 'layout')
}

export async function creaAttivitaManuale(form: FormData) {
  const scadenza = testo(form, 'scadenza')
  const priorita = testo(form, 'priorita')
  await db.attivita.create({
    data: {
      utenteId: await uid(),
      titolo: testo(form, 'titolo'),
      dettaglio: opzionale(form, 'dettaglio'),
      scadenza: scadenza ? new Date(scadenza) : null,
      priorita: CODICI_PRIORITA.includes(priorita as never) ? priorita : 'P2',
      creataDaAI: false,
    },
  })
  revalidatePath('/attivita')
}

export async function eliminaAttivita(id: string) {
  await db.attivita.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/attivita')
}

// ---------- Bozze ----------

export async function salvaBozza(id: string, oggetto: string, corpo: string) {
  const bozza = await db.bozza.findFirst({ where: { id, utenteId: await uid() } })
  if (!bozza) return
  await db.bozza.update({
    where: { id },
    data: { oggetto, corpo, modificata: corpo !== bozza.corpoAI },
  })
  revalidatePath('/', 'layout')
}

export async function inviaBozza(id: string): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const utenteId = await uid()
    const bozza = await db.bozza.findFirst({
      where: { id, utenteId },
      include: { messaggio: { include: { account: true } } },
    })
    if (!bozza) return { ok: false, messaggio: 'Bozza non trovata.' }
    if (bozza.inviata) return { ok: false, messaggio: 'Questa bozza è già stata inviata.' }
    if (!bozza.messaggio) return { ok: false, messaggio: 'Bozza senza messaggio d’origine.' }

    const account = bozza.messaggio.account
    const { corpo: corpoFinale, tradottoIn } = await traduciSeStraniera(
      bozza.messaggio.lingua,
      bozza.corpo
    )
    const daInviare: DaInviare = {
      a: bozza.a || bozza.messaggio.mittente,
      cc: bozza.cc,
      oggetto: bozza.oggetto,
      corpo: corpoFinale,
      inRispostaA: bozza.messaggio.messageId,
    }

    const { raw, messageId } = await spedisci(account, daInviare)
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId)

    await db.bozza.update({ where: { id }, data: { inviata: true, inviataIl: new Date() } })
    await db.messaggio.update({
      where: { id: bozza.messaggio.id },
      data: { letto: true, serveRisposta: false },
    })

    revalidatePath('/', 'layout')
    const nota = tradottoIn ? ` Tradotto in ${tradottoIn} prima dell’invio.` : ''
    return { ok: true, messaggio: `Risposta inviata a ${daInviare.a}.${nota}${avviso ? ` ${avviso}` : ''}` }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Invio non riuscito' }
  }
}

// ---------- Scrivere e inviare ----------

type DaInviare = {
  a: string
  cc?: string
  oggetto: string
  corpo: string
  inRispostaA?: string | null
}

async function spedisci(account: Account, m: DaInviare): Promise<{ raw: Buffer; messageId: string }> {
  const composer = new MailComposer({
    from: `${account.nome} <${account.email}>`,
    to: m.a,
    cc: m.cc || undefined,
    subject: m.oggetto,
    text: m.corpo,
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
  })
  await transporter.sendMail({
    envelope: { from: account.email, to: [m.a, ...(m.cc ? m.cc.split(',').map((x) => x.trim()) : [])] },
    raw,
  })

  return { raw, messageId }
}

async function registraInviato(
  utenteId: string,
  account: Account,
  m: DaInviare,
  raw: Buffer,
  messageId: string
): Promise<string | null> {
  let avviso: string | null = null

  let cartella = account.cartellaInviata
  try {
    if (!cartella) {
      cartella = await trovaCartellaInviata(account)
      if (cartella) {
        await db.account.update({ where: { id: account.id }, data: { cartellaInviata: cartella } })
      }
    }
    if (cartella) await salvaInInviata(account, cartella, raw)
    else avviso = 'Copia non salvata sul server: cartella “Inviata” non trovata.'
  } catch {
    avviso = 'Copia non salvata nella cartella “Inviata” del server.'
  }

  const ultimo = await db.messaggio.findFirst({
    where: { accountId: account.id, direzione: 'uscita' },
    orderBy: { uid: 'asc' },
    select: { uid: true },
  })
  const uidMsg = Math.min(-1, (ultimo?.uid ?? 0) - 1)

  await db.messaggio.create({
    data: {
      utenteId,
      accountId: account.id,
      uid: uidMsg,
      direzione: 'uscita',
      messageId,
      mittente: account.email,
      mittenteNome: account.nome,
      destinatari: [m.a, m.cc].filter(Boolean).join(', '),
      oggetto: m.oggetto,
      data: new Date(),
      anteprima: m.corpo.replace(/\s+/g, ' ').slice(0, 200),
      corpoTesto: m.corpo,
      letto: true,
    },
  })

  return avviso
}

export async function inviaMessaggio(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const utenteId = await uid()
    const messaggioId = testo(form, 'messaggioId')
    const a = testo(form, 'a')
    const cc = testo(form, 'cc')
    const oggetto = testo(form, 'oggetto')
    const corpo = testo(form, 'corpo')

    if (!a) return { ok: false, messaggio: 'Manca il destinatario.' }
    if (!corpo) return { ok: false, messaggio: 'Il messaggio è vuoto.' }

    const originale = await db.messaggio.findFirst({
      where: { id: messaggioId, utenteId },
      include: { account: true },
    })
    if (!originale) return { ok: false, messaggio: 'Messaggio d’origine non trovato.' }

    const account = originale.account
    const inoltro = testo(form, 'modo') === 'inoltra'

    // Rispondendo a una mail straniera: scritta in italiano, inviata nella sua
    // lingua. Un inoltro invece si manda com'è.
    const { corpo: corpoFinale, tradottoIn } = inoltro
      ? { corpo, tradottoIn: null }
      : await traduciSeStraniera(originale.lingua, corpo)

    const daInviare: DaInviare = {
      a,
      cc,
      oggetto,
      corpo: corpoFinale,
      inRispostaA: inoltro ? null : originale.messageId,
    }

    const { raw, messageId } = await spedisci(account, daInviare)
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId)

    if (!inoltro) {
      await db.messaggio.update({ where: { id: messaggioId }, data: { letto: true, serveRisposta: false } })
    }

    const bozzaId = testo(form, 'bozzaId')
    if (bozzaId) await db.bozza.deleteMany({ where: { id: bozzaId, utenteId } })

    revalidatePath('/', 'layout')
    const nota = tradottoIn ? ` Tradotto in ${tradottoIn} prima dell’invio.` : ''
    return { ok: true, messaggio: `Messaggio inviato a ${a}.${nota}${avviso ? ` ${avviso}` : ''}` }
  } catch (e) {
    return { ok: false, messaggio: `Invio non riuscito: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

export async function salvaMinuta(
  form: FormData
): Promise<{ ok: boolean; messaggio: string; id?: string }> {
  try {
    const utenteId = await uid()
    const bozzaId = testo(form, 'bozzaId')
    const messaggioId = testo(form, 'messaggioId')
    const dati = {
      a: testo(form, 'a'),
      cc: testo(form, 'cc'),
      oggetto: testo(form, 'oggetto'),
      corpo: testo(form, 'corpo'),
      modo: testo(form, 'modo') || 'rispondi',
      origine: 'utente',
    }

    if (!dati.corpo && !dati.a) return { ok: false, messaggio: 'Non c’è ancora niente da salvare.' }

    let bozza
    if (bozzaId) {
      const mia = await db.bozza.findFirst({ where: { id: bozzaId, utenteId } })
      if (!mia) return { ok: false, messaggio: 'Bozza non trovata.' }
      bozza = await db.bozza.update({ where: { id: bozzaId }, data: { ...dati, modificata: true } })
    } else {
      bozza = await db.bozza.create({
        data: { ...dati, utenteId, messaggioId: messaggioId || null, corpoAI: '' },
      })
    }

    revalidatePath('/', 'layout')
    return { ok: true, messaggio: 'Bozza salvata. La trovi in Bozze.', id: bozza.id }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' }
  }
}

export async function eliminaBozza(id: string) {
  await db.bozza.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/', 'layout')
}

// ---------- Sezioni ----------

export async function creaSezione(form: FormData) {
  const utenteId = await uid()
  const ultima = await db.sezione.findFirst({ where: { utenteId }, orderBy: { ordine: 'desc' } })
  await db.sezione.create({
    data: {
      utenteId,
      nome: testo(form, 'nome'),
      descrizione: testo(form, 'descrizione'),
      colore: testo(form, 'colore') || 'blue',
      ordine: (ultima?.ordine ?? 0) + 1,
    },
  })
  revalidatePath('/', 'layout')
}

export async function eliminaSezione(id: string) {
  await db.sezione.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/', 'layout')
}

// ---------- Regole ----------

export async function creaRegola(form: FormData) {
  const utenteId = await uid()
  const sezioneId = opzionale(form, 'sezioneId')
  // La sezione scelta dev'essere dell'utente.
  const sezioneValida = sezioneId
    ? await db.sezione.findFirst({ where: { id: sezioneId, utenteId }, select: { id: true } })
    : null

  await db.regola.create({
    data: {
      utenteId,
      nome: testo(form, 'nome'),
      priorita: Number(testo(form, 'priorita') || 0),
      seMittente: opzionale(form, 'seMittente'),
      seOggetto: opzionale(form, 'seOggetto'),
      seContiene: opzionale(form, 'seContiene'),
      istruzioneAI: opzionale(form, 'istruzioneAI'),
      sezioneId: sezioneValida?.id ?? null,
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
  await db.regola.updateMany({ where: { id, utenteId: await uid() }, data: { attiva } })
  revalidatePath('/regole')
}

export async function eliminaRegola(id: string) {
  await db.regola.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/regole')
}

// ---------- Account ----------

export async function creaAccount(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const utenteId = await uid()
    const dati = {
      utenteId,
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
    return { ok: false, messaggio: `Collegamento non riuscito: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

export async function eliminaAccount(id: string) {
  await db.account.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/impostazioni')
}

// ---------- Impostazioni ----------

/**
 * La firma è personale (sempre salvabile). Il contesto aziendale è condiviso:
 * lo modifica solo un admin, perché vale per tutta l'azienda.
 */
export async function salvaImpostazioni(form: FormData) {
  const u = await utenteCorrente()
  if (!u) return

  // Le lingue lette arrivano come caselle spuntate (più valori con lo stesso
  // nome): si raccolgono tutte. Se non ne spunti nessuna, resta l'italiano.
  const lingue = form
    .getAll('lingueLette')
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean)
  await db.utente.update({
    where: { id: u.id },
    data: {
      firma: testo(form, 'firma'),
      traduzioneAuto: flag(form, 'traduzioneAuto'),
      lingueLette: lingue.length ? lingue.join(', ') : 'italiano',
    },
  })
  if (u.ruolo === 'admin' && form.has('contestoAzienda')) {
    await scriviImpostazione('contesto_azienda', testo(form, 'contestoAzienda'))
  }
  revalidatePath('/impostazioni')
}

/**
 * Prima di inviare una risposta a una mail in lingua straniera, traduce il
 * testo (scritto in italiano) nella lingua dell'originale. Se l'originale è in
 * italiano, o la lingua non è nota, non tocca niente.
 */
async function traduciSeStraniera(
  linguaOriginale: string | null,
  corpoItaliano: string
): Promise<{ corpo: string; tradottoIn: string | null }> {
  const lingua = linguaOriginale?.trim()
  if (!lingua || lingua.toLowerCase() === 'italiano') {
    return { corpo: corpoItaliano, tradottoIn: null }
  }
  try {
    const corpo = await traduciVerso({ testo: corpoItaliano, lingua })
    return { corpo, tradottoIn: lingua }
  } catch {
    // Se la traduzione fallisce si invia comunque, in italiano: meglio una
    // risposta che parte di una bloccata.
    return { corpo: corpoItaliano, tradottoIn: null }
  }
}
