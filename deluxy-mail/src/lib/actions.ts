'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { Account, Prisma } from '@prisma/client'
import { alternative } from './condizioni'
import { leggiEventoProposto } from './eventoProposto'
import { db } from './db'
import { cifra, decifra } from './crypto'
import {
  analizzaContattoOra,
  analizzaMessaggioOra,
  leggiQuadroContatto,
  messaggiThread,
  preparaEsecuzione,
  riassumiThreadOra,
  scaricaStorico,
  sincronizzaUtente,
  type QuadroContatto,
  type RiassuntoThreadSalvato,
} from './sync'
import { chiaveThread } from './thread'
import { CODICI_PRIORITA, FUSO } from './format'
import { traduciVerso, pianificaAttivita, pianificaConProposta, estraiDatiAzione, riassumiSezione } from './ai'
import { raggruppa } from './thread'
import { azioneDi, regolaAppPerMail, chiaveDiAzione, type AzioneDescritta } from './appDeluxy'
import { leggiChiaviApp, salvaChiaveApp, type NomeChiaveApp } from './chiaviApp'
import { provaConnessione, salvaInInviata, trovaCartellaInviata } from './imap'
import { scriviImpostazione, leggiImpostazioni, CHIAVI } from './impostazioni'
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

  // L'analisi non deve MAI far lanciare l'azione: se qualcosa va storto
  // (OpenAI, database, timeout) il client deve ricevere un messaggio, non un
  // errore silenzioso — altrimenti "cliccando la priorità non succede nulla".
  try {
    const esito = await analizzaMessaggioOra(id, utenteId)
    revalidatePath('/', 'layout')
    return esito
  } catch (e) {
    revalidatePath('/', 'layout')
    return {
      ok: false,
      messaggio: e instanceof Error ? e.message : 'Analisi non riuscita: riprova.',
    }
  }
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

/**
 * L'AI riassume una conversazione (thread) "per punti di vista". Se esiste già
 * un riassunto e non si chiede di rifarlo, si restituisce quello salvato.
 */
export async function riassumiConversazione(
  messaggioId: string
): Promise<{ ok: boolean; messaggio: string; riassunto?: RiassuntoThreadSalvato }> {
  const utenteId = await uid()
  const esito = await riassumiThreadOra(utenteId, messaggioId)
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

/** Crea un'attività scritta da te. Se la colleghi a un contatto, l'AI potrà
 *  eseguirla (scrivere la mail) col tasto "Esegui". */
export async function creaAttivitaManuale(
  form: FormData
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const titolo = testo(form, 'titolo')
  if (!titolo) return { ok: false, messaggio: 'Serve un titolo per l’attività.' }

  const scad = testo(form, 'scadenza')
  const contatto = testo(form, 'contattoEmail').toLowerCase() || null
  const codice = testo(form, 'priorita')
  const priorita = CODICI_PRIORITA.includes(codice as never) ? codice : 'P2'

  await db.attivita.create({
    data: {
      utenteId,
      titolo,
      dettaglio: opzionale(form, 'dettaglio'),
      scadenza: scad ? new Date(scad) : null,
      priorita,
      contattoEmail: contatto,
      creataDaAI: false,
    },
  })
  revalidatePath('/attivita')
  revalidatePath('/', 'layout')
  return {
    ok: true,
    messaggio: contatto ? 'Attività creata. Puoi eseguirla con l’AI.' : 'Attività creata.',
  }
}

/** Trasforma un comando in linguaggio naturale in attività concrete (via AI). */
export async function attivitaDaComando(
  comando: string
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  if (!comando.trim()) return { ok: false, messaggio: 'Scrivi cosa vuoi fare.' }

  try {
    const imp = await leggiImpostazioni()
    const piano = await pianificaAttivita({
      comando,
      contestoAzienda: imp[CHIAVI.contestoAzienda],
      oggi: new Date(),
    })
    if (piano.length === 0) return { ok: false, messaggio: 'Non ho ricavato attività: prova a essere più specifico.' }

    for (const a of piano) {
      await db.attivita.create({
        data: {
          utenteId,
          titolo: a.titolo,
          dettaglio: a.dettaglio || null,
          scadenza: a.scadenza ? new Date(a.scadenza) : null,
          priorita: CODICI_PRIORITA.includes(a.priorita as never) ? a.priorita : 'P2',
          creataDaAI: true,
        },
      })
    }
    revalidatePath('/attivita')
    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio: piano.length === 1 ? '1 attività creata dall’AI.' : `${piano.length} attività create dall’AI.`,
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Non riuscito.'
    if (/connection error|fetch failed|ENOTFOUND|network/i.test(m))
      return { ok: false, messaggio: 'Connessione a OpenAI non riuscita: riprova.' }
    if (/401|API key/i.test(m)) return { ok: false, messaggio: 'Chiave OpenAI non valida.' }
    return { ok: false, messaggio: m.slice(0, 120) }
  }
}

export type EsitoNuovaAttivita = {
  ok: boolean
  messaggio: string
  /** La proposta di azione che l'AI può intraprendere, da mostrare all'utente. */
  proposta?: string
  /** L'attività (con contatto) che l'AI può eseguire subito col "Procedi". */
  eseguibileId?: string
}

/**
 * "Nuova attività": l'utente racconta cosa c'è da seguire, l'AI la crea e
 * propone l'azione che può intraprendere (preparare la bozza di mail se ha
 * riconosciuto un contatto). Non invia mai nulla da sola.
 */
export async function creaAttivitaConProposta(comando: string): Promise<EsitoNuovaAttivita> {
  const utenteId = await uid()
  if (!comando.trim()) return { ok: false, messaggio: 'Racconta cosa devo seguire.' }

  try {
    const imp = await leggiImpostazioni()

    // I contatti recenti della casella: gli unici indirizzi che l'AI può
    // agganciare a un'attività (mai inventati).
    const recenti = await db.messaggio.findMany({
      where: { utenteId, direzione: 'entrata', cestinato: false },
      orderBy: { data: 'desc' },
      distinct: ['mittente'],
      take: 40,
      select: { mittente: true, mittenteNome: true },
    })
    const contatti = recenti.map((m) => ({ email: m.mittente, nome: m.mittenteNome }))
    const conosciute = new Set(contatti.map((c) => c.email.toLowerCase()))

    const piano = await pianificaConProposta({
      comando,
      contestoAzienda: imp[CHIAVI.contestoAzienda],
      contatti,
      oggi: new Date(),
    })
    if (piano.attivita.length === 0) {
      return { ok: false, messaggio: 'Non ho ricavato attività: prova a essere più specifico.' }
    }

    let eseguibileId: string | undefined
    for (const a of piano.attivita) {
      // Il contatto vale solo se è davvero fra quelli conosciuti.
      const contatto =
        a.contattoEmail && conosciute.has(a.contattoEmail.toLowerCase())
          ? a.contattoEmail.toLowerCase()
          : null
      const creata = await db.attivita.create({
        data: {
          utenteId,
          titolo: a.titolo,
          dettaglio: a.dettaglio || null,
          scadenza: a.scadenza ? new Date(a.scadenza) : null,
          priorita: CODICI_PRIORITA.includes(a.priorita as never) ? a.priorita : 'P2',
          contattoEmail: contatto,
          creataDaAI: true,
        },
      })
      if (contatto && !eseguibileId) eseguibileId = creata.id
    }

    revalidatePath('/attivita')
    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio:
        piano.attivita.length === 1
          ? 'Attività creata: la seguo io.'
          : `${piano.attivita.length} attività create: le seguo io.`,
      proposta: piano.proposta,
      eseguibileId,
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Non riuscito.'
    if (/connection error|fetch failed|ENOTFOUND|network/i.test(m))
      return { ok: false, messaggio: 'Connessione a OpenAI non riuscita: riprova.' }
    if (/401|API key/i.test(m)) return { ok: false, messaggio: 'Chiave OpenAI non valida.' }
    return { ok: false, messaggio: m.slice(0, 120) }
  }
}

export async function rianalizza(id: string): Promise<{ ok: boolean; messaggio: string }> {
  const esito = await analizzaMessaggioOra(id, await uid())
  revalidatePath('/', 'layout')
  return esito
}

// ---------- Contatti AI (il "PLUS AI") ----------

/**
 * Attiva/disattiva il PLUS AI su un contatto. Un contatto AI finisce nella
 * AI Inbox e su di lui l'AI fa il quadro (mail ricevute e inviate) per
 * definire le prossime attività. Restituisce lo stato risultante.
 */
export async function cambiaContattoAI(
  email: string,
  attiva: boolean
): Promise<{ ok: boolean; attiva: boolean }> {
  const utenteId = await uid()
  const pulita = email.trim().toLowerCase()
  if (!pulita) return { ok: false, attiva: false }

  if (attiva) {
    await db.contattoAI.upsert({
      where: { utenteId_email: { utenteId, email: pulita } },
      create: { utenteId, email: pulita },
      update: {},
    })
  } else {
    await db.contattoAI.deleteMany({ where: { utenteId, email: pulita } })
  }

  revalidatePath('/', 'layout')
  return { ok: true, attiva }
}

// ---------- Istruzioni AI mirate (contatto / conversazione) ----------

/**
 * Salva le istruzioni AI per un contatto. Scriverle rende il contatto "AI"
 * (compare nella AI Inbox): è coerente, stai dicendo all'AI come trattarlo.
 */
export async function salvaIstruzioniContatto(
  email: string,
  testo: string
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const pulita = email.trim().toLowerCase()
  if (!pulita) return { ok: false, messaggio: 'Contatto non valido.' }

  await db.contattoAI.upsert({
    where: { utenteId_email: { utenteId, email: pulita } },
    create: { utenteId, email: pulita, istruzioni: testo.trim() },
    update: { istruzioni: testo.trim() },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: testo.trim() ? 'Istruzioni salvate.' : 'Istruzioni rimosse.' }
}

/** Salva le istruzioni AI per la conversazione a cui appartiene un messaggio. */
export async function salvaIstruzioniThread(
  messaggioId: string,
  testo: string
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const conversazione = await messaggiThread(utenteId, messaggioId)
  if (conversazione.length === 0) return { ok: false, messaggio: 'Conversazione non trovata.' }
  const chiave = chiaveThread(conversazione)

  const pulito = testo.trim()
  if (!pulito) {
    await db.istruzioneThread.deleteMany({ where: { utenteId, chiave } })
  } else {
    await db.istruzioneThread.upsert({
      where: { utenteId_chiave: { utenteId, chiave } },
      create: { utenteId, chiave, istruzioni: pulito },
      update: { istruzioni: pulito },
    })
  }
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: pulito ? 'Istruzioni salvate.' : 'Istruzioni rimosse.' }
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
    const threadRadice = bozza.messaggio.thread || bozza.messaggio.messageId
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId, threadRadice)

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
  messageId: string,
  threadRadice: string | null
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
      // Radice della conversazione dell'originale: così la risposta si
      // raggruppa nello stesso thread anche se cambia l'oggetto.
      thread: threadRadice,
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
    // Un inoltro apre una conversazione nuova; una risposta resta nel thread
    // dell'originale (la sua radice, o il suo Message-ID se ne è il capostipite).
    const threadRadice = inoltro ? null : originale.thread || originale.messageId
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId, threadRadice)

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

/** Invia una mail scritta da zero (non in risposta a niente): apre una
 *  conversazione nuova dal primo account dell'utente. */
export async function inviaNuovaMail(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const utenteId = await uid()
    const a = testo(form, 'a')
    const cc = testo(form, 'cc')
    const oggetto = testo(form, 'oggetto')
    const corpo = testo(form, 'corpo')

    if (!a) return { ok: false, messaggio: 'Manca il destinatario.' }
    if (!corpo) return { ok: false, messaggio: 'Il messaggio è vuoto.' }

    const account = await db.account.findFirst({ where: { utenteId } })
    if (!account) return { ok: false, messaggio: 'Nessuna casella collegata: aggiungila in Impostazioni.' }

    const daInviare: DaInviare = { a, cc, oggetto, corpo, inRispostaA: null }
    const { raw, messageId } = await spedisci(account, daInviare)
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId, null)

    const bozzaId = testo(form, 'bozzaId')
    if (bozzaId) await db.bozza.deleteMany({ where: { id: bozzaId, utenteId } })

    revalidatePath('/', 'layout')
    return { ok: true, messaggio: `Messaggio inviato a ${a}.${avviso ? ` ${avviso}` : ''}` }
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

// ---------- Aggancio manuale delle mail a una conversazione ----------

export type CandidatoAggancio = {
  id: string
  mittente: string
  mittenteNome: string | null
  oggetto: string
  data: Date
  giaNelThread: boolean
}

/** Cerca fra le tue mail quelle da agganciare a questa conversazione. */
export async function cercaDaAgganciare(
  messaggioId: string,
  query: string
): Promise<CandidatoAggancio[]> {
  const utenteId = await uid()
  const q = query.trim()
  if (q.length < 2) return []

  const nelThread = new Set((await messaggiThread(utenteId, messaggioId)).map((m) => m.id))

  const trovati = await db.messaggio.findMany({
    where: {
      utenteId,
      cestinato: false,
      OR: [
        { oggetto: { contains: q, mode: 'insensitive' } },
        { mittente: { contains: q, mode: 'insensitive' } },
        { mittenteNome: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { data: 'desc' },
    take: 15,
    select: { id: true, mittente: true, mittenteNome: true, oggetto: true, data: true },
  })

  return trovati
    .filter((m) => m.id !== messaggioId)
    .map((m) => ({ ...m, giaNelThread: nelThread.has(m.id) }))
}

/**
 * Aggancia una mail alla conversazione di un'altra: da qui in poi l'AI le
 * legge insieme. Se una delle due è già in un gruppo manuale si riusa quel
 * codice, così i gruppi si fondono invece di spezzarsi.
 */
export async function agganciaAlThread(
  messaggioId: string,
  daAgganciareId: string
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const [base, altro] = await Promise.all([
    db.messaggio.findFirst({ where: { id: messaggioId, utenteId }, select: { id: true, threadManuale: true } }),
    db.messaggio.findFirst({ where: { id: daAgganciareId, utenteId }, select: { id: true, threadManuale: true } }),
  ])
  if (!base || !altro) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const codice = base.threadManuale || altro.threadManuale || randomBytes(12).toString('base64url')

  // Tutta la conversazione di partenza entra nel gruppo: agganciando una mail
  // a un thread ci si aspetta che valga per il thread, non per un messaggio.
  const idsBase = (await messaggiThread(utenteId, messaggioId)).map((m) => m.id)
  const idsAltro = (await messaggiThread(utenteId, daAgganciareId)).map((m) => m.id)

  await db.messaggio.updateMany({
    where: { utenteId, id: { in: [...new Set([...idsBase, ...idsAltro, base.id, altro.id])] } },
    data: { threadManuale: codice },
  })

  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Mail agganciata: ora l’AI le legge insieme.' }
}

/** Stacca una mail dal gruppo manuale (torna ai legami naturali). */
export async function staccaDalThread(messaggioId: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  await db.messaggio.updateMany({
    where: { id: messaggioId, utenteId },
    data: { threadManuale: null },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Mail staccata dalla conversazione.' }
}

// ---------- Calendario ----------

export async function creaEvento(form: FormData): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const titolo = testo(form, 'titolo')
  if (!titolo) return { ok: false, messaggio: 'Serve un titolo.' }

  const giorno = testo(form, 'giorno') // YYYY-MM-DD
  if (!giorno) return { ok: false, messaggio: 'Serve la data.' }
  const giornataIntera = flag(form, 'giornataIntera')
  const oraInizio = testo(form, 'oraInizio') // HH:MM
  const oraFine = testo(form, 'oraFine')

  // Le date arrivano come ora italiana: si memorizzano in UTC. Il fuso di
  // Roma è +2 d'estate/+1 d'inverno: lo calcola il formatter, non a mano.
  const locale = (o: string) => {
    const [h, m] = o.split(':').map(Number)
    const [Y, M, G] = giorno.split('-').map(Number)
    // Trova l'offset del fuso Europe/Rome per quel giorno.
    const utcBase = Date.UTC(Y, M - 1, G, h ?? 0, m ?? 0)
    const inRoma = new Date(utcBase).toLocaleString('en-US', { timeZone: FUSO })
    const offset = utcBase - new Date(`${inRoma} UTC`).getTime()
    return new Date(utcBase + offset)
  }

  const inizio = giornataIntera ? new Date(`${giorno}T00:00:00Z`) : locale(oraInizio || '09:00')
  const fine = giornataIntera ? null : oraFine ? locale(oraFine) : null
  if (fine && fine < inizio) return { ok: false, messaggio: 'La fine è prima dell’inizio.' }

  await db.evento.create({
    data: {
      utenteId,
      titolo,
      descrizione: testo(form, 'descrizione'),
      luogo: testo(form, 'luogo'),
      inizio,
      fine,
      giornataIntera,
      messaggioId: opzionale(form, 'messaggioId'),
    },
  })
  revalidatePath('/calendario')
  return { ok: true, messaggio: 'Appuntamento salvato.' }
}

export async function eliminaEvento(id: string) {
  await db.evento.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/calendario')
}

/** Accende (o rigenera) il feed iCal: un token nuovo invalida il vecchio link. */
export async function rigeneraFeedCalendario(): Promise<{ ok: boolean; token: string }> {
  const utenteId = await uid()
  const token = randomBytes(24).toString('base64url')
  await db.utente.update({ where: { id: utenteId }, data: { tokenCalendario: token } })
  revalidatePath('/calendario')
  return { ok: true, token }
}

/** Spegne il feed: il link smette di funzionare per chiunque lo avesse. */
export async function spegniFeedCalendario() {
  await db.utente.update({ where: { id: await uid() }, data: { tokenCalendario: '' } })
  revalidatePath('/calendario')
}

/** Converte "YYYY-MM-DDTHH:MM" (o "YYYY-MM-DD"), inteso in ora italiana, in un
 *  istante UTC. Ripiega su una lettura grezza se il formato è inatteso. */
function oraItalianaInUtc(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
  }
  const [Y, M, G, h, min] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number)
  const utcBase = Date.UTC(Y, M - 1, G, h, min)
  const inRoma = new Date(utcBase).toLocaleString('en-US', { timeZone: FUSO })
  const offset = utcBase - new Date(`${inRoma} UTC`).getTime()
  return new Date(utcBase + offset)
}

/** Accetta la proposta di appuntamento dell'AI: crea l'evento e lo lega alla
 *  mail. Poi la proposta si spegne (non si ripropone). */
export async function accettaEventoProposto(
  messaggioId: string
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: { eventoProposto: true },
  })
  const ev = leggiEventoProposto(m?.eventoProposto ?? null)
  if (!ev) return { ok: false, messaggio: 'Nessun appuntamento da aggiungere.' }

  const inizio = ev.giornataIntera
    ? new Date(`${ev.inizio.slice(0, 10)}T00:00:00Z`)
    : oraItalianaInUtc(ev.inizio)
  if (!inizio) return { ok: false, messaggio: 'La data della proposta non è valida.' }
  const fine = !ev.giornataIntera && ev.fine ? oraItalianaInUtc(ev.fine) : null

  await db.evento.create({
    data: {
      utenteId,
      titolo: ev.titolo,
      luogo: ev.luogo || '',
      inizio,
      fine: fine && fine > inizio ? fine : null,
      giornataIntera: ev.giornataIntera,
      messaggioId,
      creatoDaAI: true,
    },
  })
  await db.messaggio.update({ where: { id: messaggioId }, data: { eventoProposto: null } })

  revalidatePath('/calendario')
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Aggiunto al calendario.' }
}

/** Scarta la proposta di appuntamento senza crearlo. */
export async function ignoraEventoProposto(messaggioId: string): Promise<void> {
  await db.messaggio.updateMany({
    where: { id: messaggioId, utenteId: await uid() },
    data: { eventoProposto: null },
  })
  revalidatePath('/', 'layout')
}

// ---------- APP DELUXY: dalla mail a una funzione di un'altra app ----------

export type PropostaApp = {
  ok: boolean
  messaggio: string
  /** true quando manca una regola: il client fa scegliere l'azione a mano. */
  scegli?: boolean
  azione?: AzioneDescritta
  /** I dati estratti dall'AI, in JSON leggibile (l'utente li può ritoccare). */
  dati?: string
}

/**
 * Prepara la proposta: quale azione (dalla regola APP DELUXY, o quella scelta
 * a mano) e i dati estratti dalla mail con l'AI. NON invia nulla: l'invio
 * avviene solo con eseguiInvioApp, dopo la conferma dell'utente.
 */
export async function proponiPerApp(
  messaggioId: string,
  azioneId?: string
): Promise<PropostaApp> {
  const utenteId = await uid()
  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: { mittente: true, mittenteNome: true, oggetto: true, data: true, corpoTesto: true },
  })
  if (!m) return { ok: false, messaggio: 'Messaggio non trovato.' }

  // Senza azione esplicita decidono le regole APP DELUXY dell'utente.
  let istruzioniRegola: string[] = []
  let scelta = azioneId
  if (!scelta) {
    try {
      const regole = await db.regolaApp.findMany({ where: { utenteId } })
      const regola = regolaAppPerMail(regole, m)
      if (regola) {
        scelta = regola.azioneId
        if (regola.istruzioni.trim()) istruzioniRegola = [regola.istruzioni.trim()]
      }
    } catch {
      /* tabella non ancora migrata: si sceglie a mano */
    }
    if (!scelta) {
      return {
        ok: false,
        scegli: true,
        messaggio: 'Nessuna regola aggancia questa mail: scegli tu l’app.',
      }
    }
  }

  const azione = azioneDi(scelta)
  if (!azione) return { ok: false, messaggio: 'Azione sconosciuta.' }

  const chiavi = await leggiChiaviApp()
  const configurata = chiaveDiAzione(azione, chiavi).length > 0
  if (!configurata) {
    return {
      ok: false,
      messaggio: `${azione.app} non è collegata: imposta la chiave in Impostazioni App.`,
    }
  }

  try {
    const imp = await leggiImpostazioni()
    const dati = await estraiDatiAzione({
      messaggio: m,
      nomeAzione: `${azione.app} — ${azione.nome}`,
      guida: azione.guida,
      schema: azione.schema,
      istruzioni: istruzioniRegola,
      contestoAzienda: imp[CHIAVI.contestoAzienda],
    })
    const { id, app, nome, descrizione, colore } = azione
    return {
      ok: true,
      messaggio: 'Dati pronti: controllali e conferma.',
      azione: { id, app, nome, descrizione, colore, configurata },
      dati: JSON.stringify(dati, null, 2),
    }
  } catch (e) {
    const t = e instanceof Error ? e.message : 'Non riuscito.'
    if (/connection error|fetch failed|ENOTFOUND|network/i.test(t))
      return { ok: false, messaggio: 'Connessione a OpenAI non riuscita: riprova.' }
    if (/401|API key/i.test(t)) return { ok: false, messaggio: 'Chiave OpenAI non valida.' }
    return { ok: false, messaggio: t.slice(0, 140) }
  }
}

/** Esegue davvero la chiamata all'app, dopo la conferma dell'utente. */
export async function eseguiInvioApp(
  messaggioId: string,
  azioneId: string,
  datiJson: string
): Promise<{ ok: boolean; messaggio: string; link?: string }> {
  const u = await utenteCorrente()
  if (!u) return { ok: false, messaggio: 'Sessione scaduta: rientra.' }
  const utenteId = u.id
  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: { id: true },
  })
  if (!m) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const azione = azioneDi(azioneId)
  if (!azione) return { ok: false, messaggio: 'Azione sconosciuta.' }

  const chiavi = await leggiChiaviApp()
  const chiave = chiaveDiAzione(azione, chiavi)
  if (!chiave) return { ok: false, messaggio: `${azione.app} non è collegata.` }

  let dati: Record<string, unknown>
  try {
    dati = JSON.parse(datiJson)
  } catch {
    return { ok: false, messaggio: 'I dati non sono un JSON valido: correggi e riprova.' }
  }

  const esito = await azione.esegui(dati, { utenteEmail: u.email, chiave })

  try {
    await db.invioApp.create({
      data: {
        utenteId,
        messaggioId: m.id,
        azioneId: azione.id,
        esito: esito.ok ? 'ok' : 'errore',
        esitoTesto: esito.messaggio,
        dati: datiJson.slice(0, 8000),
        link: esito.link ?? null,
      },
    })
  } catch {
    /* lo storico non deve bloccare l'esito */
  }

  revalidatePath('/', 'layout')
  return esito
}

// ---------- Regole APP DELUXY ----------

export async function creaRegolaApp(form: FormData) {
  const utenteId = await uid()
  const azioneId = testo(form, 'azioneId')
  if (!azioneDi(azioneId)) return
  await db.regolaApp.create({
    data: {
      utenteId,
      nome: testo(form, 'nome'),
      seMittente: opzionale(form, 'seMittente'),
      seOggetto: opzionale(form, 'seOggetto'),
      seContiene: opzionale(form, 'seContiene'),
      azioneId,
      istruzioni: testo(form, 'istruzioni'),
      priorita: Number(testo(form, 'priorita')) || 0,
    },
  })
  revalidatePath('/impostazioni-app')
}

/**
 * Salva la chiave API di un'app, inserita a mano in Impostazioni App. La cifra
 * il codice (come le password IMAP): non passa in chiaro e vale per tutta
 * l'azienda, quindi solo un admin la può impostare. Vuota = la si toglie.
 */
export async function salvaChiaveAppAction(
  nome: string,
  valore: string
): Promise<{ ok: boolean; messaggio: string }> {
  const u = await utenteCorrente()
  if (!u) return { ok: false, messaggio: 'Sessione scaduta: rientra.' }
  if (u.ruolo !== 'admin') return { ok: false, messaggio: 'Solo un amministratore può cambiare le chiavi.' }
  const nomi: NomeChiaveApp[] = ['anagrafiche', 'finance', 'fornitori']
  if (!nomi.includes(nome as NomeChiaveApp)) return { ok: false, messaggio: 'App sconosciuta.' }

  await salvaChiaveApp(nome as NomeChiaveApp, valore)
  revalidatePath('/impostazioni-app')
  return { ok: true, messaggio: valore.trim() ? 'Chiave salvata e collegata.' : 'Chiave rimossa.' }
}

export async function attivaRegolaApp(id: string, attiva: boolean) {
  await db.regolaApp.updateMany({ where: { id, utenteId: await uid() }, data: { attiva } })
  revalidatePath('/impostazioni-app')
}

export async function eliminaRegolaApp(id: string) {
  await db.regolaApp.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/impostazioni-app')
}

// ---------- Sezioni ----------

export async function creaSezione(form: FormData) {
  const utenteId = await uid()
  const ultima = await db.sezione.findFirst({ where: { utenteId }, orderBy: { ordine: 'desc' } })

  // Sottosezione: il genitore dev'essere una sezione tua e di primo livello
  // (la gerarchia si ferma a due livelli).
  const genitoreId = opzionale(form, 'genitoreId')
  const genitore = genitoreId
    ? await db.sezione.findFirst({
        where: { id: genitoreId, utenteId, genitoreId: null },
        select: { id: true, colore: true },
      })
    : null

  await db.sezione.create({
    data: {
      utenteId,
      nome: testo(form, 'nome'),
      descrizione: testo(form, 'descrizione'),
      // Una sottosezione eredita il colore del genitore: si legge come famiglia.
      colore: genitore?.colore ?? (testo(form, 'colore') || 'blue'),
      ordine: (ultima?.ordine ?? 0) + 1,
      genitoreId: genitore?.id ?? null,
    },
  })
  revalidatePath('/', 'layout')
}

/**
 * L'AI fa il punto su una sezione (o sottosezione): per periodo ("cosa è
 * successo negli ultimi N giorni") o per conversazione. Una sezione con
 * sottosezioni comprende anche la posta delle figlie.
 */
export async function riassumiSezioneOra(
  sezioneId: string,
  taglio: 'giorni' | 'thread',
  giorni = 7
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const sezione = await db.sezione.findFirst({
    where: { id: sezioneId, utenteId },
    select: { id: true, nome: true, descrizione: true },
  })
  if (!sezione) return { ok: false, messaggio: 'Sezione non trovata.' }

  // La posta della sezione e delle sue sottosezioni.
  const figlie = await db.sezione.findMany({
    where: { utenteId, genitoreId: sezione.id },
    select: { id: true },
  })
  const ids = [sezione.id, ...figlie.map((f) => f.id)]

  const giorniValidi = Math.min(Math.max(Math.round(giorni) || 7, 1), 90)
  const da = new Date(Date.now() - giorniValidi * 24 * 60 * 60 * 1000)

  const messaggi = await db.messaggio.findMany({
    where: {
      utenteId,
      cestinato: false,
      sezioneId: { in: ids },
      ...(taglio === 'giorni' ? { data: { gte: da } } : {}),
    },
    orderBy: { data: 'desc' },
    take: taglio === 'giorni' ? 120 : 200,
    select: {
      id: true,
      thread: true,
      threadManuale: true,
      oggetto: true,
      data: true,
      direzione: true,
      mittente: true,
      mittenteNome: true,
      corpoTesto: true,
      corpoTradotto: true,
    },
  })

  if (messaggi.length === 0) {
    return {
      ok: false,
      messaggio:
        taglio === 'giorni'
          ? `Nessuna mail in questa sezione negli ultimi ${giorniValidi} giorni.`
          : 'Nessuna mail in questa sezione.',
    }
  }

  const chi = (m: (typeof messaggi)[number]) => m.mittenteNome || m.mittente
  const testoDi = (m: (typeof messaggi)[number]) => m.corpoTradotto || m.corpoTesto

  // Per conversazione: un gruppo per thread, i più recenti prima. Per periodo:
  // un gruppo solo, in ordine cronologico.
  let gruppi: { titolo: string; messaggi: { direzione: string; chi: string; data: Date; testo: string }[] }[]
  let threadVisti = 0

  if (taglio === 'thread') {
    const conversazioni = raggruppa(messaggi).slice(0, 12)
    threadVisti = conversazioni.length
    gruppi = conversazioni.map((g) => ({
      titolo: g[g.length - 1].oggetto || '(senza oggetto)',
      messaggi: g.slice(-6).map((m) => ({ direzione: m.direzione, chi: chi(m), data: m.data, testo: testoDi(m) })),
    }))
  } else {
    const ordinati = [...messaggi].sort((a, b) => a.data.getTime() - b.data.getTime())
    gruppi = [
      {
        titolo: `Ultimi ${giorniValidi} giorni`,
        messaggi: ordinati.map((m) => ({
          direzione: m.direzione,
          chi: chi(m),
          data: m.data,
          testo: `${m.oggetto} — ${testoDi(m)}`,
        })),
      },
    ]
    threadVisti = raggruppa(messaggi).length
  }

  try {
    const imp = await leggiImpostazioni()
    const analisi = await riassumiSezione({
      nomeSezione: sezione.nome,
      descrizioneSezione: sezione.descrizione,
      taglio,
      giorni: giorniValidi,
      gruppi,
      contestoAzienda: imp[CHIAVI.contestoAzienda],
      oggi: new Date(),
    })

    // Si tiene solo l'ultimo riassunto per sezione+taglio: quello vecchio è
    // superato, non è storia da conservare.
    await db.riassuntoSezione.deleteMany({ where: { utenteId, sezioneId: sezione.id, taglio } })
    await db.riassuntoSezione.create({
      data: {
        utenteId,
        sezioneId: sezione.id,
        taglio,
        giorni: giorniValidi,
        testo: analisi.testo,
        punti: analisi.punti.join('\n'),
        messaggiVisti: messaggi.length,
        threadVisti,
      },
    })

    revalidatePath('/sezioni')
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: 'Riassunto pronto.' }
  } catch (e) {
    const t = e instanceof Error ? e.message : 'Non riuscito.'
    if (/connection error|fetch failed|ENOTFOUND|network/i.test(t))
      return { ok: false, messaggio: 'Connessione a OpenAI non riuscita: riprova.' }
    if (/401|API key/i.test(t)) return { ok: false, messaggio: 'Chiave OpenAI non valida.' }
    return { ok: false, messaggio: t.slice(0, 140) }
  }
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

  const regola = await db.regola.create({
    data: {
      utenteId,
      nome: testo(form, 'nome'),
      priorita: Number(testo(form, 'priorita') || 0),
      seMittente: opzionale(form, 'seMittente'),
      seOggetto: opzionale(form, 'seOggetto'),
      seContiene: opzionale(form, 'seContiene'),
      istruzioneAI: opzionale(form, 'istruzioneAI'),
      attivitaTesto: opzionale(form, 'attivitaTesto'),
      sezioneId: sezioneValida?.id ?? null,
      creaAttivita: flag(form, 'creaAttivita'),
      creaBozza: flag(form, 'creaBozza'),
      segnaLetta: flag(form, 'segnaLetta'),
      archivia: flag(form, 'archivia'),
      fermaQui: flag(form, 'fermaQui'),
    },
  })

  // Retrodata: applica SUBITO la regola ai messaggi già presenti. Solo le parti
  // deterministiche (sposta in sezione, segna letta, archivia): l'istruzione AI
  // e la creazione di attività/bozze restano legate all'analisi, non si fanno a
  // tappeto sullo storico per non spendere e non generare rumore.
  if (flag(form, 'retrodata')) {
    await retrodataRegola(utenteId, regola)
  }

  revalidatePath('/regole')
  revalidatePath('/', 'layout')
}

/** Applica le azioni deterministiche di una regola alla posta già presente.
 *  Restituisce quanti messaggi ha toccato. */
async function retrodataRegola(
  utenteId: string,
  r: {
    seMittente: string | null
    seOggetto: string | null
    seContiene: string | null
    sezioneId: string | null
    segnaLetta: boolean
    archivia: boolean
  }
): Promise<number> {
  const data: {
    sezioneId?: string
    smistatoDa?: string
    letto?: boolean
    archiviato?: boolean
  } = {}
  if (r.sezioneId) {
    data.sezioneId = r.sezioneId
    data.smistatoDa = 'regola'
  }
  if (r.segnaLetta) data.letto = true
  if (r.archivia) data.archiviato = true
  if (Object.keys(data).length === 0) return 0 // niente di deterministico da applicare

  // Ogni condizione con più alternative (separate da virgola) diventa un gruppo
  // OR; i gruppi delle diverse condizioni si combinano in AND. Così una regola
  // «oggetto contiene [DELUXY], [DELUXYFLOWERS]» retrodata su entrambe.
  const gruppoOr = (campo: 'mittente' | 'oggetto' | 'corpoTesto', condizione: string | null) => {
    const alt = alternative(condizione)
    if (alt.length === 0) return null
    return { OR: alt.map((a) => ({ [campo]: { contains: a, mode: 'insensitive' as const } })) }
  }

  const and = [
    gruppoOr('mittente', r.seMittente),
    gruppoOr('oggetto', r.seOggetto),
    gruppoOr('corpoTesto', r.seContiene),
  ].filter(Boolean) as Prisma.MessaggioWhereInput[]

  const where: Prisma.MessaggioWhereInput = {
    utenteId,
    direzione: 'entrata',
    cestinato: false,
    ...(and.length ? { AND: and } : {}),
    // Non sovrascrivere lo smistamento fatto a mano.
    ...(data.sezioneId ? { NOT: { smistatoDa: 'manuale' } } : {}),
  }

  const res = await db.messaggio.updateMany({ where, data })
  return res.count
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
