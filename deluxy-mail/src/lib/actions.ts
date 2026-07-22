'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { Account, Prisma } from '@prisma/client'
import { alternative } from './condizioni'
import { leggiEventoProposto } from './eventoProposto'
import { leggiSenzaTraduzione, lingueLetteDi } from './lingue'
import { htmlAPlain, sembraHtml, plainAHtml } from './htmlMail'

const MAX_ALLEGATI_BYTE = 20 * 1024 * 1024

/** Legge gli allegati (campo "allegati") dal FormData come Buffer. */
async function leggiAllegati(form: FormData): Promise<AllegatoInvio[]> {
  const files = form.getAll('allegati').filter((v): v is File => v instanceof File && v.size > 0)
  let totale = 0
  const out: AllegatoInvio[] = []
  for (const f of files) {
    totale += f.size
    if (totale > MAX_ALLEGATI_BYTE) throw new Error('Allegati troppo pesanti (max 20 MB in tutto).')
    out.push({
      filename: f.name,
      content: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || undefined,
    })
  }
  return out
}

/** Dal corpo del form ricava HTML (se formattato) e testo semplice. */
function corpoDaForm(grezzo: string): { html: string | undefined; testo: string } {
  const s = grezzo ?? ''
  if (sembraHtml(s)) return { html: s, testo: htmlAPlain(s) }
  // Testo semplice: lo si manda come testo, con un HTML minimo per i client
  // che preferiscono l'HTML (a-capo preservati).
  return { html: plainAHtml(s), testo: s }
}
import { db } from './db'
import { cifra, decifra } from './crypto'
import {
  analizzaContattoOra,
  analizzaMessaggioOra,
  leggiQuadroContatto,
  messaggiThread,
  preparaEsecuzione,
  preparaRispostaDelegata,
  preparaEventoDelegato,
  riassumiThreadOra,
  scaricaStorico,
  sincronizzaUtente,
  traduciMessaggioSeServe,
  type QuadroContatto,
  type RiassuntoThreadSalvato,
} from './sync'
import { chiaveThread } from './thread'
import { CODICI_PRIORITA, FUSO } from './format'
import { traduciVerso, pianificaAttivita, pianificaConProposta, estraiDatiAzione, riassumiSezione, classificaDelega, interpretaComandoPosta } from './ai'
import { raggruppa } from './thread'
import { azioneDi, regolaAppPerMail, chiaveDiAzione, type AzioneDescritta } from './appDeluxy'
import { leggiChiaviApp, salvaChiaveApp, type NomeChiaveApp } from './chiaviApp'
import { provaConnessione, salvaInInviata, trovaCartellaInviata, eliminaDalServer, leggiAllegati as leggiAllegatiImap } from './imap'
import { scriviImpostazione, leggiImpostazioni, CHIAVI } from './impostazioni'
import { CHIAVE_TOKEN_API } from './apiAuth'
import { utenteCorrente } from './sessione'
import { costruisciFirma, type FirmaDati } from './firma'
import { invitoIcs } from './ics'

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

/**
 * Archivia SENZA rinfrescare la pagina. Serve al flusso "Archivia → Sempre?":
 * se rivalidassimo subito, la lista si aggiornerebbe e la riga (con la domanda)
 * sparirebbe prima che l'utente possa rispondere. Il refresh lo fa il chiamante
 * DOPO la risposta.
 */
export async function archiviaSenzaAggiornare(id: string) {
  await db.messaggio.updateMany({
    where: { id, utenteId: await uid() },
    data: { archiviato: true, letto: true },
  })
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

/** Delega a Renè la risposta a una mail, con un'istruzione a parole. */
export async function delegaRene(
  messaggioId: string,
  istruzione: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const esito = await preparaRispostaDelegata(messaggioId, istruzione, await uid())
  revalidatePath('/', 'layout')
  return esito
}

/**
 * Traduce (se serve) un messaggio in background, dopo che la mail è già stata
 * aperta: la logica decide da sola se c'è qualcosa da tradurre. Serve a NON
 * bloccare l'apertura della mail sulla chiamata all'AI (vedi
 * TraduzioneAllApertura). Non usa revalidatePath: la pagina si aggiorna da sé.
 */
export async function traduciMessaggio(
  messaggioId: string
): Promise<{ ok: boolean; lingua: string | null }> {
  const { lingua } = await traduciMessaggioSeServe(messaggioId, await uid())
  // `lingua` valorizzata = c'è qualcosa di nuovo da mostrare (traduzione o
  // semplicemente lingua rilevata). Null = niente da fare / errore: il client
  // NON aggiorna, così non si innesca un ciclo di ritentativi.
  return { ok: true, lingua }
}

/** Delega a Renè un appuntamento a partire da una mail (+ eventuale indicazione). */
export async function delegaReneEvento(
  messaggioId: string,
  indicazione: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const esito = await preparaEventoDelegato(messaggioId, indicazione, await uid())
  revalidatePath('/calendario')
  revalidatePath('/', 'layout')
  return esito
}

/**
 * Delega a Renè LEGGENDO l'istruzione: decide da solo se preparare una mail
 * (rispondi/riassumi/recap/inoltra) o mettere in agenda un appuntamento. Un solo
 * ingresso, niente pulsanti da scegliere. `tipo` dice al client cosa fare col
 * risultato (navigare alla bozza, o aggiornare per l'evento).
 */
export async function delegaReneAuto(
  messaggioId: string,
  istruzione: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string; tipo: 'risposta' | 'agenda' }> {
  const utenteId = await uid()
  const azione = await classificaDelega(istruzione)
  if (azione === 'agenda') {
    const esito = await preparaEventoDelegato(messaggioId, istruzione, utenteId)
    revalidatePath('/calendario')
    revalidatePath('/', 'layout')
    return { ...esito, tipo: 'agenda' }
  }
  const esito = await preparaRispostaDelegata(messaggioId, istruzione, utenteId)
  revalidatePath('/', 'layout')
  return { ...esito, tipo: 'risposta' }
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

    // Ogni attività è eseguibile: con un contatto l'AI risponde all'ultima sua
    // mail; senza, scrive una mail nuova. Per il tasto "Procedi" si preferisce
    // la prima attività CON contatto (proposta più mirata), altrimenti la prima.
    let eseguibileId: string | undefined
    let eseguibileConContatto = false
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
      if (!eseguibileConContatto && (contatto || !eseguibileId)) {
        eseguibileId = creata.id
        eseguibileConContatto = Boolean(contatto)
      }
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

/** Cestina TUTTE le mail di un thread (dato un messaggio qualsiasi del thread). */
export async function cestinaThread(messaggioId: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const ids = (await messaggiThread(utenteId, messaggioId)).map((m) => m.id)
  if (ids.length === 0) return { ok: false, messaggio: 'Conversazione non trovata.' }
  const r = await db.messaggio.updateMany({
    where: { id: { in: ids }, utenteId },
    data: { cestinato: true, cestinatoIl: new Date(), letto: true },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `${r.count} mail del thread spostate nel cestino.` }
}

/** Archivia TUTTE le mail del thread, SENZA rinfrescare (flusso "Archivia →
 *  Sempre?"): in posta in arrivo una riga è un thread, quindi archiviare deve
 *  togliere l'intera conversazione, non solo il messaggio più recente. */
export async function archiviaThreadSenzaAggiornare(messaggioId: string) {
  const utenteId = await uid()
  const ids = (await messaggiThread(utenteId, messaggioId)).map((m) => m.id)
  if (ids.length === 0) return
  await db.messaggio.updateMany({
    where: { id: { in: ids }, utenteId },
    data: { archiviato: true, letto: true },
  })
}

/** Sposta nello SPAM TUTTE le mail del thread (crea la sezione SPAM se manca). */
export async function segnalaSpamThread(messaggioId: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const ids = (await messaggiThread(utenteId, messaggioId)).map((m) => m.id)
  if (ids.length === 0) return { ok: false, messaggio: 'Conversazione non trovata.' }
  let spam = await db.sezione.findFirst({ where: { utenteId, nome: 'SPAM' }, select: { id: true } })
  if (!spam) {
    const max = await db.sezione.aggregate({ where: { utenteId }, _max: { ordine: true } })
    spam = await db.sezione.create({
      data: { utenteId, nome: 'SPAM', descrizione: 'Posta indesiderata', colore: 'red', ordine: (max._max.ordine ?? 0) + 1 },
      select: { id: true },
    })
  }
  const r = await db.messaggio.updateMany({
    where: { id: { in: ids }, utenteId },
    data: { sezioneId: spam.id, smistatoDa: 'manuale', letto: true },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `${r.count} mail del thread nello SPAM.` }
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
    const utenteId = await uid()
    const cestinati = await db.messaggio.findMany({
      where: { cestinato: true, utenteId },
      select: { uid: true, direzione: true, accountId: true },
    })

    // Cancellazione DAL SERVER (irreversibile): raccolgo gli UID reali per
    // account e cartella — la posta in entrata sta nella INBOX, gli inviati
    // nella cartella "Inviata". Gli UID negativi (copie locali senza riscontro
    // sul server) si saltano.
    const perAccount = new Map<string, { inbox: number[]; inviata: number[] }>()
    for (const m of cestinati) {
      if (m.uid <= 0) continue
      const g = perAccount.get(m.accountId) ?? { inbox: [], inviata: [] }
      if (m.direzione === 'uscita') g.inviata.push(m.uid)
      else g.inbox.push(m.uid)
      perAccount.set(m.accountId, g)
    }

    let suServer = 0
    const errori: string[] = []
    for (const [accountId, g] of perAccount) {
      const account = await db.account.findUnique({ where: { id: accountId } })
      if (!account) continue
      try {
        if (g.inbox.length) suServer += await eliminaDalServer(account, account.cartella, g.inbox)
        if (g.inviata.length && account.cartellaInviata) {
          suServer += await eliminaDalServer(account, account.cartellaInviata, g.inviata)
        }
      } catch {
        errori.push(account.email)
      }
    }

    const r = await db.messaggio.deleteMany({ where: { cestinato: true, utenteId } })
    revalidatePath('/', 'layout')
    const nota = errori.length
      ? ` Attenzione: sul server di ${errori.join(', ')} la cancellazione non è riuscita (riprova).`
      : ''
    return {
      ok: errori.length === 0,
      messaggio: `Cestino svuotato: ${r.count} rimossi da AI Mail, ${suServer} cancellati anche dal server (definitivo).${nota}`,
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

/**
 * Azione su PIÙ mail insieme (selezione multipla dalla lista): archivia, cestina,
 * segna letta/non letta, o sposta in una sezione. Ogni azione fa lo stesso della
 * versione a mail singola, ma su tutti gli id selezionati in un colpo solo.
 */
export type AzioneMassa = 'archivia' | 'cestina' | 'letto' | 'nonletto' | 'sposta'

export async function azioneMassa(
  ids: string[],
  azione: AzioneMassa,
  sezioneId?: string | null
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const puliti = [...new Set(ids)].filter(Boolean)
  if (puliti.length === 0) return { ok: false, messaggio: 'Nessuna mail selezionata.' }
  const where = { id: { in: puliti }, utenteId }

  let n = 0
  switch (azione) {
    case 'archivia':
      n = (await db.messaggio.updateMany({ where, data: { archiviato: true, letto: true } })).count
      break
    case 'cestina':
      n = (await db.messaggio.updateMany({ where, data: { cestinato: true, cestinatoIl: new Date(), letto: true } })).count
      break
    case 'letto':
      n = (await db.messaggio.updateMany({ where, data: { letto: true } })).count
      break
    case 'nonletto':
      n = (await db.messaggio.updateMany({ where, data: { letto: false } })).count
      break
    case 'sposta': {
      // La sezione, se indicata, dev'essere dell'utente (come nello spostamento singolo).
      if (sezioneId) {
        const mia = await db.sezione.findFirst({ where: { id: sezioneId, utenteId } })
        if (!mia) return { ok: false, messaggio: 'Sezione non trovata.' }
      }
      n = (await db.messaggio.updateMany({
        where,
        data: { sezioneId: sezioneId ?? null, smistatoDa: sezioneId ? 'manuale' : null },
      })).count
      break
    }
    default:
      return { ok: false, messaggio: 'Azione non valida.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `${n} mail aggiornate.` }
}

/**
 * Segna una mail come NON spam: la tira fuori dalla sezione SPAM, la riporta in
 * Posta in arrivo e la marca 'manuale' così l'AI non la rispedisce nello SPAM.
 * Da qui in poi il mittente è un contatto "noto" (ha un messaggio in archivio),
 * quindi le sue prossime mail non finiranno più in spam automaticamente.
 */
export async function segnalaNonSpam(id: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  await db.messaggio.updateMany({
    where: { id, utenteId },
    data: { sezioneId: null, smistatoDa: 'manuale', archiviato: false },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Spostata in Posta in arrivo: non è spam.' }
}

/**
 * Segna una mail come SPAM: la sposta nella sezione SPAM (creandola se manca).
 * Marcata 'manuale' e letta, così esce dalla posta in arrivo e non gonfia i
 * non letti. La si recupera aprendo lo SPAM ("Non è spam").
 */
export async function segnalaSpam(id: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  let spam = await db.sezione.findFirst({ where: { utenteId, nome: 'SPAM' }, select: { id: true } })
  if (!spam) {
    const max = await db.sezione.aggregate({ where: { utenteId }, _max: { ordine: true } })
    spam = await db.sezione.create({
      data: {
        utenteId,
        nome: 'SPAM',
        descrizione: 'Posta indesiderata',
        colore: 'red',
        ordine: (max._max.ordine ?? 0) + 1,
      },
      select: { id: true },
    })
  }
  await db.messaggio.updateMany({
    where: { id, utenteId },
    data: { sezioneId: spam.id, smistatoDa: 'manuale', letto: true },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Spostata nello SPAM.' }
}

// ---------- Allegati (letti on-demand dal server) ----------

/** L'elenco degli allegati di un messaggio, letto dal server al momento. */
export async function elencoAllegati(
  messaggioId: string
): Promise<{ nome: string; tipo: string; dimensione: number }[]> {
  const utenteId = await uid()
  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    include: { account: true },
  })
  if (!m || m.uid <= 0) return []
  const cartella = m.direzione === 'uscita' ? m.account.cartellaInviata || undefined : m.account.cartella
  try {
    return await leggiAllegatiImap(m.account, m.uid, cartella)
  } catch {
    return []
  }
}

// ---------- Notifiche push ----------

/** Salva (o aggiorna) l'iscrizione push di QUESTO dispositivo per l'utente. */
export async function salvaIscrizionePush(sub: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ ok: boolean }> {
  const utenteId = await uid()
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false }
  try {
    await db.pushIscrizione.upsert({
      where: { endpoint: sub.endpoint },
      create: { utenteId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { utenteId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Manda una notifica di PROVA a tutti i dispositivi iscritti dell'utente:
 *  serve a verificare la catena (chiavi VAPID → iscrizione → consegna). */
export async function notificaProva(): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  let quante = 0
  try {
    quante = await db.pushIscrizione.count({ where: { utenteId } })
  } catch {
    return { ok: false, messaggio: 'Tabella delle iscrizioni non ancora pronta.' }
  }
  if (quante === 0) {
    return { ok: false, messaggio: 'Nessun dispositivo iscritto: attiva prima le notifiche qui sotto.' }
  }
  const { inviaPush } = await import('./push')
  await inviaPush(utenteId, {
    titolo: 'Notifica di prova',
    corpo: 'Se la leggi, le notifiche di AI Mail funzionano su questo dispositivo. ✓',
    url: '/',
  })
  return {
    ok: true,
    messaggio: `Inviata a ${quante} dispositivo${quante === 1 ? '' : 'i'} iscritt${quante === 1 ? 'o' : 'i'}. Se non arriva, controlla i permessi di notifica del browser/telefono.`,
  }
}

/** Toglie l'iscrizione push di questo dispositivo (disattiva le notifiche qui). */
export async function rimuoviIscrizionePush(endpoint: string): Promise<{ ok: boolean }> {
  const utenteId = await uid()
  if (!endpoint) return { ok: false }
  try {
    await db.pushIscrizione.deleteMany({ where: { endpoint, utenteId } })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ---------- Comando in linguaggio naturale su un lotto di mail ----------

type FiltroLotto = {
  criterio: 'mittente' | 'oggetto'
  valore: string
  // Ambito di ricerca: undefined = ovunque; una stringa = quella sezione;
  // null = solo le mail SENZA sezione (da smistare).
  sezioneId?: string | null
}

/** Il WHERE (sempre scoped per utente, mai il cestino) per un comando di lotto. */
function whereLotto(utenteId: string, f: FiltroLotto) {
  const v = f.valore.trim()
  const base: Record<string, unknown> = { utenteId, cestinato: false }
  // Se è indicata una sezione (o "senza sezione"), si cerca solo lì.
  if (f.sezioneId !== undefined) base.sezioneId = f.sezioneId
  if (f.criterio === 'mittente') {
    return {
      ...base,
      OR: [
        { mittente: { contains: v, mode: 'insensitive' as const } },
        { mittenteNome: { contains: v, mode: 'insensitive' as const } },
      ],
    }
  }
  return { ...base, oggetto: { contains: v, mode: 'insensitive' as const } }
}

/** Etichetta dell'ambito di ricerca per i messaggi di anteprima/esito. */
async function etichettaAmbito(utenteId: string, sezioneId?: string | null): Promise<string> {
  if (sezioneId === undefined) return ''
  if (sezioneId === null) return ' (tra le mail senza sezione)'
  const s = await db.sezione.findFirst({ where: { id: sezioneId, utenteId }, select: { nome: true } })
  return s ? ` (nella sezione «${s.nome}»)` : ''
}

/**
 * Anteprima di un comando ("cancella tutte le mail di Mario"): interpreta il
 * testo e CONTA quante mail verrebbero toccate, senza toccarle. Serve a far
 * confermare all'utente prima di un'azione di massa.
 */
export async function comandoPostaAnteprima(
  comando: string,
  sezioneId?: string | null
): Promise<{
  ok: boolean
  messaggio: string
  azione?: 'cestina' | 'archivia'
  criterio?: 'mittente' | 'oggetto'
  valore?: string
  quanti?: number
}> {
  const utenteId = await uid()
  const p = await interpretaComandoPosta(comando)
  if (p.azione === 'nessuna' || p.criterio === 'nessuno' || !p.valore.trim()) {
    return {
      ok: false,
      messaggio:
        'Non ho capito su quali mail agire. Prova: «cancella tutte le mail di mario@…» oppure «archivia le mail con oggetto sollecito».',
    }
  }
  const filtro: FiltroLotto = { criterio: p.criterio, valore: p.valore, sezioneId }
  const quanti = await db.messaggio.count({ where: whereLotto(utenteId, filtro) })
  const verbo = p.azione === 'cestina' ? 'cestinare' : 'archiviare'
  const dove = p.criterio === 'mittente' ? 'di' : 'con oggetto'
  const ambito = await etichettaAmbito(utenteId, sezioneId)
  return {
    ok: true,
    azione: p.azione,
    criterio: p.criterio,
    valore: p.valore,
    quanti,
    messaggio:
      quanti === 0
        ? `Nessuna mail ${dove} «${p.valore}»${ambito}: non c'è niente da ${verbo}.`
        : `Sto per ${verbo} ${quanti} mail ${dove} «${p.valore}»${ambito}. Confermi?`,
  }
}

/** Esegue davvero il comando di lotto (dopo conferma). Cestina = recuperabile. */
export async function comandoPostaEsegui(
  azione: 'cestina' | 'archivia',
  criterio: 'mittente' | 'oggetto',
  valore: string,
  sezioneId?: string | null
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  if (!['cestina', 'archivia'].includes(azione) || !['mittente', 'oggetto'].includes(criterio) || !valore.trim()) {
    return { ok: false, messaggio: 'Comando non valido.' }
  }
  const where = whereLotto(utenteId, { criterio, valore, sezioneId })
  const ambito = await etichettaAmbito(utenteId, sezioneId)
  if (azione === 'cestina') {
    const r = await db.messaggio.updateMany({ where, data: { cestinato: true, cestinatoIl: new Date() } })
    revalidatePath('/', 'layout')
    return { ok: true, messaggio: `Cestinate ${r.count} mail${ambito}. Le trovi nel Cestino se ti servono.` }
  }
  const r = await db.messaggio.updateMany({ where, data: { archiviato: true } })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `Archiviate ${r.count} mail${ambito}.` }
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

export async function inviaBozza(id: string, form?: FormData): Promise<{ ok: boolean; messaggio: string }> {
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
    const { html, testo: testoPiano } = corpoDaForm(bozza.corpo)
    const allegati = form ? await leggiAllegati(form) : []
    // Se serve tradurre (lingua non letta) si manda solo testo tradotto.
    const t = await traduciSeStraniera(utenteId, bozza.messaggio.lingua, testoPiano)
    const tradottoIn = t.tradottoIn
    const daInviare: DaInviare = {
      a: bozza.a || bozza.messaggio.mittente,
      cc: bozza.cc,
      oggetto: bozza.oggetto,
      corpo: t.tradottoIn ? t.corpo : testoPiano,
      corpoHtml: t.tradottoIn ? undefined : html,
      allegati,
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

type AllegatoInvio = { filename: string; content: Buffer; contentType?: string }

type DaInviare = {
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

async function spedisci(account: Account, m: DaInviare): Promise<{ raw: Buffer; messageId: string }> {
  const composer = new MailComposer({
    from: `${account.nome} <${account.email}>`,
    to: m.a,
    cc: m.cc || undefined,
    subject: m.oggetto,
    text: m.corpo,
    ...(m.corpoHtml ? { html: m.corpoHtml } : {}),
    ...(m.allegati && m.allegati.length ? { attachments: m.allegati } : {}),
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

async function registraInviato(
  utenteId: string,
  account: Account,
  m: DaInviare,
  raw: Buffer,
  messageId: string,
  threadRadice: string | null,
  // Sezione ereditata dall'originale: rispondendo a una mail già in una sezione,
  // anche la risposta finisce nella stessa (così il thread resta insieme).
  sezioneId: string | null = null,
  // Priorità scelta al momento dell'invio (P0…P3): resta sulla mail inviata.
  priorita: string | null = null
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
      corpoHtml: m.corpoHtml ?? null,
      allegati: m.allegati?.length ?? 0,
      letto: true,
      sezioneId,
      smistatoDa: sezioneId ? 'manuale' : null,
      priorita,
      prioritaDa: priorita ? 'manuale' : null,
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
    const { html, testo: testoPiano } = corpoDaForm(testo(form, 'corpo'))
    const allegati = await leggiAllegati(form)

    if (!a) return { ok: false, messaggio: 'Manca il destinatario.' }
    if (!testoPiano && allegati.length === 0) return { ok: false, messaggio: 'Il messaggio è vuoto.' }

    const originale = await db.messaggio.findFirst({
      where: { id: messaggioId, utenteId },
      include: { account: true },
    })
    if (!originale) return { ok: false, messaggio: 'Messaggio d’origine non trovato.' }

    const account = originale.account
    const inoltro = testo(form, 'modo') === 'inoltra'

    // Rispondendo a una mail straniera (in una lingua che non leggi): scritta in
    // italiano, tradotta all'invio. Se si traduce, si manda SOLO testo: la
    // formattazione non sopravvive alla traduzione. Un inoltro va com'è.
    let corpoTesto = testoPiano
    let corpoHtml = html
    let tradottoIn: string | null = null
    if (!inoltro) {
      const t = await traduciSeStraniera(utenteId, originale.lingua, testoPiano)
      if (t.tradottoIn) {
        corpoTesto = t.corpo
        corpoHtml = undefined
        tradottoIn = t.tradottoIn
      }
    }

    const daInviare: DaInviare = {
      a,
      cc,
      oggetto,
      corpo: corpoTesto,
      corpoHtml,
      allegati,
      inRispostaA: inoltro ? null : originale.messageId,
    }

    const { raw, messageId } = await spedisci(account, daInviare)
    // Un inoltro apre una conversazione nuova; una risposta resta nel thread
    // dell'originale (la sua radice, o il suo Message-ID se ne è il capostipite).
    const threadRadice = inoltro ? null : originale.thread || originale.messageId
    // Rispondendo, la mia mail eredita la sezione dell'originale (un inoltro no:
    // apre una conversazione nuova).
    const sezioneEreditata = inoltro ? null : originale.sezioneId
    // La priorità scelta al momento dell'invio (facoltativa).
    const prioritaScelta = CODICI_PRIORITA.includes(testo(form, 'priorita') as never)
      ? testo(form, 'priorita')
      : null
    const avviso = await registraInviato(
      utenteId, account, daInviare, raw, messageId, threadRadice, sezioneEreditata, prioritaScelta
    )

    // Sequenza di follow-up agganciata all'invio (facoltativa).
    let notaSequenza: string | null = null
    const seqId = testo(form, 'sequenzaId')
    if (seqId) {
      notaSequenza = await iscriviASequenza({
        utenteId,
        sequenzaId: seqId,
        destinatari: a,
        oggetto,
        thread: threadRadice || messageId,
      })
    }

    // Se ho dato una priorità, la mail inviata viene ANALIZZATA dall'AI (come
    // quando dai la priorità a una mail in arrivo): riassunto ed eventuali
    // attività. Best-effort: non deve far fallire l'invio.
    if (prioritaScelta) {
      try {
        const inviato = await db.messaggio.findFirst({ where: { utenteId, messageId }, select: { id: true } })
        if (inviato) await analizzaMessaggioOra(inviato.id, utenteId)
      } catch {
        /* l'analisi si può rifare da "Rianalizza" */
      }
    }

    if (!inoltro) {
      await db.messaggio.update({ where: { id: messaggioId }, data: { letto: true, serveRisposta: false } })
    }

    const bozzaId = testo(form, 'bozzaId')
    if (bozzaId) await db.bozza.deleteMany({ where: { id: bozzaId, utenteId } })

    revalidatePath('/', 'layout')
    const nota = tradottoIn ? ` Tradotto in ${tradottoIn} prima dell’invio.` : ''
    return {
      ok: true,
      messaggio: `Messaggio inviato a ${a}.${nota}${avviso ? ` ${avviso}` : ''}${notaSequenza ? ` ${notaSequenza}` : ''}`,
    }
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
    const { html, testo: testoPiano } = corpoDaForm(testo(form, 'corpo'))
    const allegati = await leggiAllegati(form)

    if (!a) return { ok: false, messaggio: 'Manca il destinatario.' }
    if (!testoPiano && allegati.length === 0) return { ok: false, messaggio: 'Il messaggio è vuoto.' }

    const account = await db.account.findFirst({ where: { utenteId } })
    if (!account) return { ok: false, messaggio: 'Nessuna casella collegata: aggiungila in Impostazioni.' }

    const daInviare: DaInviare = { a, cc, oggetto, corpo: testoPiano, corpoHtml: html, allegati, inRispostaA: null }
    const { raw, messageId } = await spedisci(account, daInviare)
    const prioritaScelta = CODICI_PRIORITA.includes(testo(form, 'priorita') as never)
      ? testo(form, 'priorita')
      : null
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId, null, null, prioritaScelta)

    // Sequenza di follow-up agganciata all'invio (facoltativa).
    let notaSequenza: string | null = null
    const seqId = testo(form, 'sequenzaId')
    if (seqId) {
      notaSequenza = await iscriviASequenza({
        utenteId,
        sequenzaId: seqId,
        destinatari: a,
        oggetto,
        thread: messageId,
      })
    }

    // Priorità → analisi AI della mail inviata (best-effort).
    if (prioritaScelta) {
      try {
        const inviato = await db.messaggio.findFirst({ where: { utenteId, messageId }, select: { id: true } })
        if (inviato) await analizzaMessaggioOra(inviato.id, utenteId)
      } catch {
        /* si può rifare da "Rianalizza" */
      }
    }

    const bozzaId = testo(form, 'bozzaId')
    if (bozzaId) await db.bozza.deleteMany({ where: { id: bozzaId, utenteId } })

    revalidatePath('/', 'layout')
    return {
      ok: true,
      messaggio: `Messaggio inviato a ${a}.${avviso ? ` ${avviso}` : ''}${notaSequenza ? ` ${notaSequenza}` : ''}`,
    }
  } catch (e) {
    return { ok: false, messaggio: `Invio non riuscito: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

/**
 * Invio di una mail dall'API (chiamata da un'altra app/agente, non dalla UI):
 * prende l'utente esplicito, non la sessione. Testo semplice, dal primo account
 * dell'utente. Registra l'inviata come dalla UI.
 */
export async function inviaMailApi(
  utenteId: string,
  dati: { a: string; cc?: string; oggetto: string; corpo: string }
): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const a = (dati.a ?? '').trim()
    const oggetto = (dati.oggetto ?? '').trim()
    const corpo = (dati.corpo ?? '').trim()
    if (!a) return { ok: false, messaggio: 'Manca il destinatario (a).' }
    if (!corpo) return { ok: false, messaggio: 'Il messaggio (corpo) è vuoto.' }

    const account = await db.account.findFirst({ where: { utenteId } })
    if (!account) return { ok: false, messaggio: 'Nessuna casella collegata per questo utente.' }

    const daInviare: DaInviare = { a, cc: dati.cc, oggetto, corpo, inRispostaA: null }
    const { raw, messageId } = await spedisci(account, daInviare)
    const avviso = await registraInviato(utenteId, account, daInviare, raw, messageId, null)

    return { ok: true, messaggio: `Messaggio inviato a ${a}.${avviso ? ` ${avviso}` : ''}` }
  } catch (e) {
    return { ok: false, messaggio: `Invio non riuscito: ${e instanceof Error ? e.message : 'errore'}` }
  }
}

/** Genera (o rigenera) il token delle API di AI Mail. Solo admin. Il token
 *  nuovo invalida il vecchio: le app che lo usano vanno riaggiornate. */
export async function generaTokenApi(): Promise<{ ok: boolean; token?: string; messaggio: string }> {
  const u = await utenteCorrente()
  if (!u || u.ruolo !== 'admin') return { ok: false, messaggio: 'Solo un amministratore può gestire il token API.' }
  const token = `dxm_${randomBytes(24).toString('base64url')}`
  await scriviImpostazione(CHIAVE_TOKEN_API, cifra(token))
  revalidatePath('/impostazioni-app')
  return { ok: true, token, messaggio: 'Token generato. Copialo nelle app che devono chiamare AI Mail.' }
}

/** Spegne le API: cancella il token dal DB (se non c'è API_TOKEN nell'env,
 *  le rotte tornano a rispondere 503). Solo admin. */
export async function revocaTokenApi(): Promise<{ ok: boolean; messaggio: string }> {
  const u = await utenteCorrente()
  if (!u || u.ruolo !== 'admin') return { ok: false, messaggio: 'Solo un amministratore.' }
  await db.impostazione.deleteMany({ where: { chiave: CHIAVE_TOKEN_API } })
  revalidatePath('/impostazioni-app')
  return { ok: true, messaggio: 'Token revocato.' }
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
  /** Quanti messaggi nel thread di questa mail (1 = mail singola). */
  nel: number
}

/**
 * Cerca fra le tue mail quelle da agganciare a questa conversazione. I risultati
 * sono RAGGRUPPATI in thread (una voce per conversazione, non per singolo
 * messaggio) e le conversazioni VERE (più messaggi) vengono mostrate PER PRIME.
 */
export async function cercaDaAgganciare(
  messaggioId: string,
  query: string
): Promise<CandidatoAggancio[]> {
  const utenteId = await uid()
  const q = query.trim()
  if (q.length < 2) return []

  const nelThread = new Set((await messaggiThread(utenteId, messaggioId)).map((m) => m.id))

  // Finestra larga: prendo abbastanza mail da ricostruire i thread, poi
  // raggruppo. I campi servono al raggruppamento (thread/oggetto/manuale/scollegato).
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
    take: 120,
    select: {
      id: true, mittente: true, mittenteNome: true, oggetto: true, data: true,
      thread: true, threadManuale: true, scollegato: true,
    },
  })

  const gruppi = raggruppa(trovati)
  const candidati = gruppi
    .map((g) => {
      // Il "volto" del thread: il messaggio più recente NON già nella
      // conversazione di partenza (se tutti lo sono, si salta il gruppo).
      const fuori = g.filter((m) => !nelThread.has(m.id) && m.id !== messaggioId)
      if (fuori.length === 0) return null
      const volto = fuori[fuori.length - 1]
      return {
        id: volto.id,
        mittente: volto.mittente,
        mittenteNome: volto.mittenteNome,
        oggetto: volto.oggetto,
        data: volto.data,
        giaNelThread: false,
        nel: g.length,
      }
    })
    .filter((x): x is CandidatoAggancio => x !== null)

  // I thread veri (più messaggi) prima; a parità, i più recenti.
  candidati.sort((a, b) => b.nel - a.nel || b.data.getTime() - a.data.getTime())
  return candidati.slice(0, 20)
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
    // Agganciando si annulla anche un eventuale "sganciato" precedente: è la
    // scelta opposta, e va rispettata.
    data: { threadManuale: codice, scollegato: false },
  })

  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Mail agganciata: ora l’AI le legge insieme.' }
}

/**
 * Sgancia UNA mail dalla conversazione. La isola davvero: toglie l'aggancio
 * manuale E la marca come "scollegata", così non si riunisce nemmeno per la
 * catena di risposte o l'oggetto in comune (che l'avevano trascinata nel thread
 * sbagliato). Per rimetterla in un thread si usa «Aggancia».
 */
export async function staccaDalThread(messaggioId: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  await db.messaggio.updateMany({
    where: { id: messaggioId, utenteId },
    data: { threadManuale: null, scollegato: true },
  })
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: 'Mail sganciata dalla conversazione.' }
}

// ---------- Anagrafiche (registro centralizzato) ----------

/** Cerca aziende in Anagrafiche (per la UI di associazione della Rubrica). */
export async function cercaPartnerAnagrafiche(
  q: string
): Promise<{ id: string; nome: string; stato: string | null; citta: string | null; categoria: string | null }[]> {
  await uid() // solo utenti loggati
  const { cercaPartner } = await import('./anagrafiche')
  return (await cercaPartner(q)).map(({ id, nome, stato, citta, categoria }) => ({ id, nome, stato, citta, categoria }))
}

/** Associa un'email a un'azienda esistente in Anagrafiche. */
export async function associaContattoAnagrafiche(
  partnerId: string,
  email: string,
  nome?: string
): Promise<{ ok: boolean; messaggio: string }> {
  await uid()
  const { associaEmailAPartner } = await import('./anagrafiche')
  const esito = await associaEmailAPartner(partnerId, email, nome)
  if (esito.ok) revalidatePath(`/rubrica/${encodeURIComponent(email)}`)
  return esito
}

// ---------- Sequenze di follow-up ----------

export type PassoInput = { giorniAttesa: number; oggetto: string; corpo: string; ramo?: 'A' | 'B' }

/** Crea o aggiorna una sequenza coi suoi passi (i passi si riscrivono tutti). */
export async function salvaSequenza(dati: {
  id?: string
  nome: string
  descrizione: string
  passi: PassoInput[]
}): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const nome = dati.nome.trim()
  if (!nome) return { ok: false, messaggio: 'Serve un nome per la sequenza.' }
  const passi = (dati.passi ?? [])
    .map((p) => ({
      giorniAttesa: Math.max(0, Math.min(60, Number(p.giorniAttesa) || 0)),
      oggetto: (p.oggetto ?? '').trim(),
      corpo: (p.corpo ?? '').trim(),
      ramo: p.ramo === 'B' ? 'B' : 'A',
    }))
    .filter((p) => p.oggetto || p.corpo)
  if (passi.length === 0) return { ok: false, messaggio: 'Serve almeno un passo (oggetto e testo).' }

  let sequenzaId = dati.id ?? ''
  if (sequenzaId) {
    const mia = await db.sequenza.findFirst({ where: { id: sequenzaId, utenteId }, select: { id: true } })
    if (!mia) return { ok: false, messaggio: 'Sequenza non trovata.' }
    await db.sequenza.update({
      where: { id: sequenzaId },
      data: { nome, descrizione: dati.descrizione.trim() },
    })
    await db.sequenzaPasso.deleteMany({ where: { sequenzaId } })
  } else {
    const creata = await db.sequenza.create({
      data: { utenteId, nome, descrizione: dati.descrizione.trim() },
      select: { id: true },
    })
    sequenzaId = creata.id
  }
  await db.sequenzaPasso.createMany({
    data: passi.map((p, i) => ({ sequenzaId, ordine: i, ...p })),
  })
  revalidatePath('/sequenze')
  return { ok: true, messaggio: `Sequenza «${nome}» salvata (${passi.length} pass${passi.length === 1 ? 'o' : 'i'}).` }
}

/** Elimina una sequenza (i passi e le iscrizioni cadono in cascata). */
export async function eliminaSequenza(id: string): Promise<void> {
  await db.sequenza.deleteMany({ where: { id, utenteId: await uid() } })
  revalidatePath('/sequenze')
}

/** Ferma a mano l'iscrizione di un destinatario a una sequenza. */
export async function fermaIscrizioneSequenza(id: string): Promise<void> {
  await db.sequenzaIscrizione.updateMany({
    where: { id, utenteId: await uid(), stato: 'attiva' },
    data: { stato: 'fermata', esito: 'Fermata a mano.', prossimoInvio: null },
  })
  revalidatePath('/sequenze')
}

/**
 * Iscrive il destinatario a una sequenza subito dopo l'invio di una mail:
 * il primo follow-up parte dopo l'attesa del passo 1 (se non risponde prima).
 */
async function iscriviASequenza(opts: {
  utenteId: string
  sequenzaId: string
  destinatari: string // il campo "a" com'è
  oggetto: string
  thread: string | null
}): Promise<string | null> {
  const sequenza = await db.sequenza.findFirst({
    where: { id: opts.sequenzaId, utenteId: opts.utenteId, attiva: true },
    include: { passi: { orderBy: { ordine: 'asc' } } },
  })
  if (!sequenza || sequenza.passi.length === 0) return null

  // Il primo indirizzo del campo "a" è il destinatario della sequenza.
  const primo = emailDaLista(opts.destinatari)[0]
  if (!primo) return null

  // Il nome dalla rubrica (se lo conosciamo) rende {{nome}} più caldo.
  const noto = await db.messaggio.findFirst({
    where: { utenteId: opts.utenteId, mittente: { equals: primo, mode: 'insensitive' }, mittenteNome: { not: null } },
    orderBy: { data: 'desc' },
    select: { mittenteNome: true },
  })

  // Si parte sul ramo A: il primo follow-up è il primo passo "se non risponde".
  // Se ci sono SOLO passi "se risponde" (B), si mette un controllo ravvicinato
  // per intercettare la risposta e avviare il percorso B.
  const primoA = sequenza.passi.find((p) => p.ramo !== 'B')
  const attesa = primoA ? Math.max(0, primoA.giorniAttesa) : 1
  const GIORNO = 24 * 60 * 60 * 1000
  await db.sequenzaIscrizione.create({
    data: {
      utenteId: opts.utenteId,
      sequenzaId: sequenza.id,
      destinatario: primo,
      nomeDestinatario: noto?.mittenteNome ?? '',
      oggettoIniziale: opts.oggetto,
      thread: opts.thread,
      prossimoInvio: new Date(Date.now() + attesa * GIORNO),
    },
  })
  return primoA
    ? `Sequenza «${sequenza.nome}» avviata per ${primo}: primo follow-up fra ${attesa} giorn${attesa === 1 ? 'o' : 'i'} se non risponde.`
    : `Sequenza «${sequenza.nome}» avviata per ${primo}: parte solo se risponde (percorso B).`
}

// ---------- Renè AI ----------

export async function avviaRene(
  periodo: string,
  sezioneId?: string | null
): Promise<{ ok: boolean; messaggio: string; analisiId?: string }> {
  const { eseguiRene, periodoValidoRene } = await import('./rene')
  try {
    const esito = await eseguiRene(await uid(), periodoValidoRene(periodo), sezioneId)
    revalidatePath('/rene')
    revalidatePath('/', 'layout')
    return esito
  } catch (e) {
    const t = e instanceof Error ? e.message : 'Non riuscito.'
    if (/connection error|fetch failed|ENOTFOUND|network/i.test(t))
      return { ok: false, messaggio: 'Connessione a OpenAI non riuscita: riprova.' }
    if (/401|API key/i.test(t)) return { ok: false, messaggio: 'Chiave OpenAI non valida.' }
    return { ok: false, messaggio: t.slice(0, 140) }
  }
}

/** Decide una proposta di Renè. `eConseguenza`: da ora quel tipo lo fa da solo. */
/** Modifica i dati di una proposta di Renè PRIMA di approvarla: così l'utente
 *  la corregge e poi la esegue con i valori giusti. */
export async function modificaPropostaRene(
  id: string,
  dati: Record<string, unknown>
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const proposta = await db.reneProposta.findFirst({ where: { id, utenteId } })
  if (!proposta) return { ok: false, messaggio: 'Proposta non trovata.' }
  if (proposta.stato !== 'proposta') return { ok: false, messaggio: 'Proposta già decisa.' }
  await db.reneProposta.update({ where: { id }, data: { dati: JSON.stringify(dati) } })
  revalidatePath('/rene')
  return { ok: true, messaggio: 'Proposta aggiornata.' }
}

export async function decidiPropostaRene(
  id: string,
  approva: boolean,
  eConseguenza = false
): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const proposta = await db.reneProposta.findFirst({ where: { id, utenteId } })
  if (!proposta) return { ok: false, messaggio: 'Proposta non trovata.' }
  if (proposta.stato !== 'proposta') return { ok: false, messaggio: 'Proposta già decisa.' }

  if (!approva) {
    await db.reneProposta.update({ where: { id }, data: { stato: 'rifiutata' } })
    revalidatePath('/rene')
    return { ok: true, messaggio: 'Proposta scartata (non verrà riproposta).' }
  }

  const { applicaPropostaRene, creaRegolaDaSmista, TIPI_RENE } = await import('./rene')
  let dati: Record<string, unknown> = {}
  try {
    dati = JSON.parse(proposta.dati)
  } catch {
    /* dati rotti: fallirà con messaggio chiaro */
  }
  const esito = await applicaPropostaRene(utenteId, proposta.tipo, dati)
  await db.reneProposta.update({
    where: { id },
    data: { stato: esito.ok ? 'applicata' : 'errore', esitoTesto: esito.messaggio },
  })

  let extra = ''
  if (esito.ok && eConseguenza) {
    if (proposta.tipo === 'smista') {
      // "Fai sempre così" su uno SMISTAMENTO = una REGOLA deterministica sul
      // mittente (le prossime mail di quel mittente vanno da sole in sezione),
      // non la conseguenza generica sul tipo.
      const reg = await creaRegolaDaSmista(utenteId, dati)
      if (reg.ok) extra = ` ${reg.messaggio}`
    } else {
      // Gli altri tipi: la scelta "sempre" resta una conseguenza sul tipo.
      await db.reneConseguenza.upsert({
        where: { utenteId_tipo: { utenteId, tipo: proposta.tipo } },
        create: { utenteId, tipo: proposta.tipo, descrizione: TIPI_RENE[proposta.tipo] ?? proposta.tipo },
        update: { attiva: true },
      })
    }
  }

  revalidatePath('/rene')
  revalidatePath('/', 'layout')
  return extra ? { ...esito, messaggio: `${esito.messaggio}${extra}` } : esito
}

/** Approva in blocco tutte le proposte in attesa di un'analisi. */
export async function approvaTutteRene(analisiId: string): Promise<{ ok: boolean; messaggio: string }> {
  const utenteId = await uid()
  const proposte = await db.reneProposta.findMany({
    where: { utenteId, analisiId, stato: 'proposta' },
    orderBy: { creataIl: 'asc' },
  })
  if (proposte.length === 0) return { ok: false, messaggio: 'Niente da approvare.' }

  const { applicaPropostaRene } = await import('./rene')
  let okCount = 0
  for (const p of proposte) {
    let dati: Record<string, unknown> = {}
    try {
      dati = JSON.parse(p.dati)
    } catch {
      /* fallirà con esito chiaro */
    }
    const esito = await applicaPropostaRene(utenteId, p.tipo, dati)
    await db.reneProposta.update({
      where: { id: p.id },
      data: { stato: esito.ok ? 'applicata' : 'errore', esitoTesto: esito.messaggio },
    })
    if (esito.ok) okCount++
  }
  revalidatePath('/rene')
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `${okCount} su ${proposte.length} proposte applicate.` }
}

/** Accende/spegne una conseguenza (il "fai da solo" per un tipo di azione). */
export async function cambiaConseguenzaRene(id: string, attiva: boolean) {
  await db.reneConseguenza.updateMany({ where: { id, utenteId: await uid() }, data: { attiva } })
  revalidatePath('/rene')
}

/** Lo stile con cui Renè scrive e risponde alle mail (condiviso, admin). */
export async function salvaStileRene(form: FormData): Promise<void> {
  const u = await utenteCorrente()
  if (!u || u.ruolo !== 'admin') return
  await scriviImpostazione(CHIAVI.stileScrittura, String(form.get('stile') ?? '').slice(0, 2000))
  revalidatePath('/rene')
  revalidatePath('/', 'layout')
}

/** La guida su come gestire i tipi di richiesta: l'AI la applica all'analisi. */
export async function salvaGuidaGestione(form: FormData): Promise<void> {
  const u = await utenteCorrente()
  if (!u || u.ruolo !== 'admin') return
  await scriviImpostazione(CHIAVI.guidaGestione, String(form.get('guida') ?? '').slice(0, 3000))
  revalidatePath('/rene')
  revalidatePath('/', 'layout')
}

/** Il taccuino di Renè lo puoi correggere a mano: resta compatto. */
export async function salvaMemoriaRene(form: FormData): Promise<void> {
  const utenteId = await uid()
  const testo = String(form.get('testo') ?? '').slice(0, 1500)
  await db.reneMemoria.upsert({
    where: { utenteId },
    create: { utenteId, testo },
    update: { testo },
  })
  revalidatePath('/rene')
}

// ---------- Calendario ----------

// L'indirizzo pubblico dell'app: serve per i link Accetta/Rifiuta nelle mail
// d'invito (devono funzionare da qualsiasi client di posta).
const URL_APP = (process.env.APP_URL || 'https://deluxy-mail.vercel.app').replace(/\/$/, '')

/** Indirizzi email validi da un campo "per virgola". */
function emailDaLista(lista: string): string[] {
  return [
    ...new Set(
      lista
        .split(/[,;]/)
        .map((x) => x.trim().toLowerCase())
        .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))
    ),
  ]
}

/**
 * Manda la MAIL D'INVITO per un evento a tutti gli invitati: allegato iCal
 * standard (METHOD:REQUEST → Sì/No nativi in Gmail/Outlook/Apple) + link
 * "Accetta / Rifiuta" nel corpo che registrano la risposta nell'app.
 * La copia resta in Posta inviata come ogni altra mail.
 */
async function inviaInvitoEvento(utenteId: string, eventoId: string): Promise<string | null> {
  const evento = await db.evento.findFirst({ where: { id: eventoId, utenteId } })
  if (!evento) return null
  const invitati = emailDaLista(evento.invitati)
  if (invitati.length === 0) return null

  const account = await db.account.findFirst({ where: { utenteId, attivo: true } })
  if (!account) return 'Nessuna casella collegata: invito non inviato.'

  // Il token dei link di risposta: uno per evento, generato al primo invio.
  let token = evento.tokenInvito
  if (!token) {
    token = randomBytes(18).toString('base64url')
    await db.evento.update({ where: { id: evento.id }, data: { tokenInvito: token } })
  }

  const quando = evento.giornataIntera
    ? evento.inizio.toLocaleDateString('it-IT', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : evento.inizio.toLocaleString('it-IT', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

  const ics = invitoIcs(evento, { nome: account.nome, email: account.email }, invitati)

  const errori: string[] = []
  for (const email of invitati) {
    const link = (r: 'si' | 'no') =>
      `${URL_APP}/api/invito?e=${evento.id}&t=${token}&chi=${encodeURIComponent(email)}&r=${r}`
    const corpoTesto = [
      `${account.nome} ti invita: ${evento.titolo}`,
      `Quando: ${quando}`,
      evento.luogo ? `Dove: ${evento.luogo}` : '',
      evento.descrizione ? `Note: ${evento.descrizione}` : '',
      '',
      `Accetta: ${link('si')}`,
      `Rifiuta: ${link('no')}`,
    ]
      .filter(Boolean)
      .join('\n')
    const corpoHtml = `
      <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6">
        <p><strong>${account.nome}</strong> ti invita:</p>
        <p style="font-size:17px;font-weight:600;margin:6px 0">${evento.titolo}</p>
        <p style="margin:4px 0">📅 ${quando}${evento.luogo ? `<br>📍 ${evento.luogo}` : ''}</p>
        ${evento.descrizione ? `<p style="color:#555">${evento.descrizione}</p>` : ''}
        <p style="margin-top:18px">
          <a href="${link('si')}" style="background:#111;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none;display:inline-block">Accetta</a>
          &nbsp;&nbsp;
          <a href="${link('no')}" style="border:1px solid #ccc;color:#333;padding:10px 22px;border-radius:999px;text-decoration:none;display:inline-block">Rifiuta</a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:16px">Puoi rispondere anche coi pulsanti del tuo programma di posta (invito in allegato).</p>
      </div>`

    try {
      const daInviare: DaInviare = {
        a: email,
        oggetto: `Invito: ${evento.titolo} — ${quando}`,
        corpo: corpoTesto,
        corpoHtml,
        ics,
      }
      const { raw, messageId } = await spedisci(account, daInviare)
      await registraInviato(utenteId, account, daInviare, raw, messageId, null)
    } catch {
      errori.push(email)
    }
  }

  revalidatePath('/calendario')
  if (errori.length === invitati.length) return 'Invito NON inviato: invio non riuscito.'
  if (errori.length > 0) return `Invito inviato, ma non a: ${errori.join(', ')}.`
  return `Invito inviato a ${invitati.join(', ')}.`
}

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

  const invitati = emailDaLista(testo(form, 'invitati'))
  const creato = await db.evento.create({
    data: {
      utenteId,
      titolo,
      descrizione: testo(form, 'descrizione'),
      luogo: testo(form, 'luogo'),
      inizio,
      fine,
      giornataIntera,
      messaggioId: opzionale(form, 'messaggioId'),
      invitati: invitati.join(', '),
    },
    select: { id: true },
  })

  // Con gli invitati parte subito la mail d'invito (iCal + link Accetta/Rifiuta).
  let notaInvito: string | null = null
  if (invitati.length > 0) notaInvito = await inviaInvitoEvento(utenteId, creato.id)

  revalidatePath('/calendario')
  return { ok: true, messaggio: `Appuntamento salvato.${notaInvito ? ` ${notaInvito}` : ''}` }
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
    select: { eventoProposto: true, mittente: true, direzione: true },
  })
  const ev = leggiEventoProposto(m?.eventoProposto ?? null)
  if (!ev) return { ok: false, messaggio: 'Nessun appuntamento da aggiungere.' }

  const inizio = ev.giornataIntera
    ? new Date(`${ev.inizio.slice(0, 10)}T00:00:00Z`)
    : oraItalianaInUtc(ev.inizio)
  if (!inizio) return { ok: false, messaggio: 'La data della proposta non è valida.' }
  const fine = !ev.giornataIntera && ev.fine ? oraItalianaInUtc(ev.fine) : null

  // L'appuntamento nasce da una mail: la controparte è il mittente, e accettando
  // gli parte la mail d'invito (iCal + Accetta/Rifiuta), così ha la conferma.
  const invitato = m?.direzione === 'entrata' ? emailDaLista(m.mittente).join(', ') : ''

  const creato = await db.evento.create({
    data: {
      utenteId,
      titolo: ev.titolo,
      luogo: ev.luogo || '',
      inizio,
      fine: fine && fine > inizio ? fine : null,
      giornataIntera: ev.giornataIntera,
      messaggioId,
      creatoDaAI: true,
      invitati: invitato,
    },
    select: { id: true },
  })
  await db.messaggio.update({ where: { id: messaggioId }, data: { eventoProposto: null } })

  let notaInvito: string | null = null
  if (invitato) notaInvito = await inviaInvitoEvento(utenteId, creato.id)

  revalidatePath('/calendario')
  revalidatePath('/', 'layout')
  return { ok: true, messaggio: `Aggiunto al calendario.${notaInvito ? ` ${notaInvito}` : ''}` }
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

/** Modifica una regola esistente (stessi campi della creazione). */
export async function aggiornaRegola(form: FormData) {
  const utenteId = await uid()
  const id = testo(form, 'id')
  if (!id) return
  const mia = await db.regola.findFirst({ where: { id, utenteId }, select: { id: true } })
  if (!mia) return

  const sezioneId = opzionale(form, 'sezioneId')
  const sezioneValida = sezioneId
    ? await db.sezione.findFirst({ where: { id: sezioneId, utenteId }, select: { id: true } })
    : null

  const regola = await db.regola.update({
    where: { id },
    data: {
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

  // Come per la creazione: la retrodata (parti deterministiche) è opzionale.
  if (flag(form, 'retrodata')) {
    await retrodataRegola(utenteId, regola)
  }

  revalidatePath('/regole')
  revalidatePath('/', 'layout')
  redirect('/regole') // esce dalla modalità modifica (via il ?modifica=)
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

  // Non sovrascrivere lo smistamento fatto a mano — ma includendo le mail
  // ANCORA da smistare (smistatoDa NULL): in SQL `NULL != 'manuale'` non è
  // vero, quindi un NOT secco le escluderebbe, cioè proprio quelle da sistemare.
  if (data.sezioneId) {
    and.push({ OR: [{ smistatoDa: null }, { smistatoDa: { not: 'manuale' } }] })
  }

  const where: Prisma.MessaggioWhereInput = {
    utenteId,
    direzione: 'entrata',
    cestinato: false,
    ...(and.length ? { AND: and } : {}),
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
      ignoraCertTls: flag(form, 'ignoraCertTls'),
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

  // L'intervallo di sincronizzazione: solo valori del menu, niente numeri liberi
  // (sotto i 30s si martella il server IMAP senza guadagno).
  const INTERVALLI = [30, 60, 120, 300, 600]
  const intervallo = Number(testo(form, 'sincronizzaOgniSec'))
  await db.utente.update({
    where: { id: u.id },
    data: {
      // La firma NON si tocca qui: si gestisce dal form dedicato (salvaFirmaDati).
      // Lo scarico storico in background non esiste più come impostazione: lo
      // storico si prende on-demand in fondo alla lista.
      traduzioneAuto: flag(form, 'traduzioneAuto'),
      lingueLette: lingue.length ? lingue.join(', ') : 'italiano',
      ...(INTERVALLI.includes(intervallo) ? { sincronizzaOgniSec: intervallo } : {}),
    },
  })
  if (u.ruolo === 'admin' && form.has('contestoAzienda')) {
    await scriviImpostazione('contesto_azienda', testo(form, 'contestoAzienda'))
  }
  revalidatePath('/impostazioni')
}

/** Salva i dati della firma dal form dedicato: genera l'HTML (Utente.firma) e
 *  conserva i campi (Utente.firmaDati) per riaprire il form. */
export async function salvaFirmaDati(form: FormData): Promise<void> {
  const u = await utenteCorrente()
  if (!u) return
  const dati: FirmaDati = {
    nome: testo(form, 'nome'),
    ruolo: testo(form, 'ruolo'),
    reparto: testo(form, 'reparto'),
    email: testo(form, 'email'),
    telefono: testo(form, 'telefono'),
    sito: testo(form, 'sito'),
  }
  await db.utente.update({
    where: { id: u.id },
    data: { firma: costruisciFirma(dati), firmaDati: JSON.stringify(dati) },
  })
  revalidatePath('/impostazioni')
  revalidatePath('/', 'layout')
}

/**
 * Prima di inviare una risposta a una mail in lingua straniera, traduce il
 * testo (scritto in italiano) nella lingua dell'originale. Se l'originale è in
 * italiano, o la lingua non è nota, non tocca niente.
 */
async function traduciSeStraniera(
  utenteId: string,
  linguaOriginale: string | null,
  corpoItaliano: string
): Promise<{ corpo: string; tradottoIn: string | null }> {
  const lingua = linguaOriginale?.trim()
  if (!lingua) return { corpo: corpoItaliano, tradottoIn: null }

  // Se la lingua dell'originale è l'italiano o una che l'utente LEGGE (e quindi
  // scrive), la risposta l'ha già scritta lui in quella lingua: non si tocca.
  // Stessa regola della traduzione in arrivo — così l'inglese, se è fra le
  // lingue lette, non viene tradotto né in entrata né in uscita.
  const u = await db.utente.findUnique({ where: { id: utenteId }, select: { lingueLette: true } })
  if (leggiSenzaTraduzione(lingua, lingueLetteDi(u?.lingueLette))) {
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
