import type { Messaggio, Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { leggiSenzaTraduzione, lingueLetteDi } from './lingue'
import {
  analizzaMessaggio,
  riassumiContatto,
  scriviRisposta,
  scriviMailNuova,
  rilevaETraduci,
  riassumiThread,
  giudicaSpam,
  type AnalisiThread,
} from './ai'
import { CHIAVI, leggiImpostazioni, STILE_DEFAULT } from './impostazioni'
import { CODICI_PRIORITA } from './format'
import { raggruppa, chiaveThread } from './thread'
import { valutaSpam } from './spam'

export type EsitoSync = {
  tipo: 'scarico' | 'storico'
  account: string
  scaricati: number
  nonSalvati: number
  scartati: number
  finito?: boolean
  errore?: string
}

function transitorio(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return (
    t.includes('unexpected message from server') ||
    t.includes("Can't reach database server") ||
    t.includes('Connection reset') ||
    t.includes('ECONNRESET') ||
    t.includes('connection closed')
  )
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * L'AI a volte rimette l'ORIGINALE nel campo traduzione (non traduce davvero).
 * Se "traduzione" e originale sono quasi identici, non è una traduzione: va
 * scartata, altrimenti il badge "Tradotto" appare su un testo ancora straniero.
 */
function traduzioneFinta(originale: string, traduzione: string): boolean {
  const pulisci = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const a = pulisci(originale)
  const b = pulisci(traduzione)
  if (!b) return true
  if (a === b) return true
  // Overlap forte sull'inizio (dove sta il grosso del testo utile): se i primi
  // ~300 caratteri coincidono, l'AI ha ricopiato l'originale.
  const n = Math.min(a.length, b.length, 300)
  if (n >= 40 && a.slice(0, n) === b.slice(0, n)) return true
  return false
}

/**
 * Se la traduzione automatica è attiva, rileva la lingua di un messaggio in
 * arrivo e, se è straniera, lo traduce in italiano. Si fa una volta sola:
 * `lingua` resta valorizzato e il risultato è memorizzato, quindi riaprire il
 * messaggio non ripaga la traduzione.
 *
 * Restituisce i campi aggiornati così la pagina non deve rileggere.
 */
export async function traduciMessaggioSeServe(
  messaggioId: string,
  utenteId: string
): Promise<{ lingua: string | null; corpoTradotto: string | null }> {
  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: { lingua: true, corpoTradotto: true, corpoTesto: true, direzione: true },
  })
  if (!m) return { lingua: null, corpoTradotto: null }
  // Già controllato, oppure è una mia mail inviata: niente da fare.
  if (m.lingua !== null || m.direzione !== 'entrata') {
    return { lingua: m.lingua, corpoTradotto: m.corpoTradotto }
  }

  const utente = await db.utente.findUnique({
    where: { id: utenteId },
    select: { traduzioneAuto: true, lingueLette: true },
  })
  if (!utente?.traduzioneAuto) return { lingua: null, corpoTradotto: null }

  try {
    const lingueLette = lingueLetteDi(utente.lingueLette)

    const esito = await rilevaETraduci({ testo: m.corpoTesto, lingueLette })

    // La scelta dell'utente decide QUI, non nel prompt: il modello a volte
    // traduce lo stesso una lingua che sai leggere. Le regole deterministiche
    // battono sempre l'AI. E se l'AI ha ricopiato l'originale invece di
    // tradurre, la traduzione finta si scarta (niente badge su testo straniero).
    const corpoTradotto =
      leggiSenzaTraduzione(esito.lingua, lingueLette) || traduzioneFinta(m.corpoTesto, esito.traduzione)
        ? null
        : esito.traduzione.trim() || null

    await db.messaggio.update({
      where: { id: messaggioId },
      data: { lingua: esito.lingua, corpoTradotto },
    })
    return { lingua: esito.lingua, corpoTradotto }
  } catch {
    // Una traduzione fallita non deve impedire di leggere la mail: si riprova
    // alla prossima apertura (lingua resta null).
    return { lingua: null, corpoTradotto: null }
  }
}

/**
 * Le istruzioni AI mirate per un messaggio: quelle del contatto e quelle della
 * conversazione. Ordine di precedenza: la conversazione prevale sul contatto,
 * che prevale sul contesto globale (passato a parte). Sono istruzioni FIDATE
 * (le scrive l'utente), tenute separate dal corpo delle email.
 */
export async function istruzioniMirate(
  utenteId: string,
  opts: { mittente?: string | null; messaggioId?: string }
): Promise<string[]> {
  const righe: string[] = []
  try {
    if (opts.mittente) {
      const c = await db.contattoAI.findUnique({
        where: { utenteId_email: { utenteId, email: opts.mittente.toLowerCase() } },
        select: { istruzioni: true },
      })
      if (c?.istruzioni?.trim()) {
        righe.push(`Per il contatto ${opts.mittente}, vale questa istruzione: ${c.istruzioni.trim()}`)
      }
    }
    if (opts.messaggioId) {
      const conversazione = await messaggiThread(utenteId, opts.messaggioId)
      if (conversazione.length > 0) {
        const chiave = chiaveThread(conversazione)
        const t = await db.istruzioneThread.findUnique({
          where: { utenteId_chiave: { utenteId, chiave } },
          select: { istruzioni: true },
        })
        if (t?.istruzioni?.trim()) {
          righe.push(
            `Per QUESTA conversazione (prevale sulle altre istruzioni): ${t.istruzioni.trim()}`
          )
        }
      }
    }
  } catch {
    // Se le tabelle/colonne non ci sono ancora, semplicemente niente istruzioni mirate.
  }
  return righe
}

/** Il contesto aziendale (condiviso) e la firma personale dell'utente. */
async function contestoAI(
  utenteId: string
): Promise<{ contestoAzienda?: string; firma?: string; stileScrittura?: string }> {
  const [impostazioni, utente] = await Promise.all([
    leggiImpostazioni(),
    db.utente.findUnique({ where: { id: utenteId }, select: { firma: true } }),
  ])
  return {
    contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
    firma: utente?.firma || undefined,
    // Lo stile lo decide Renè (referente): se non impostato, il default educato.
    stileScrittura: impostazioni[CHIAVI.stileScrittura]?.trim() || STILE_DEFAULT,
  }
}

/**
 * Analizza un messaggio con l'AI quando gli dai una priorità. Tutto ciò che
 * tocca (sezioni, regole, attività) è dell'utente proprietario del messaggio.
 */
export async function analizzaMessaggioOra(
  messaggioId: string,
  utenteId: string
): Promise<{ ok: boolean; messaggio: string }> {
  const m = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
  if (!m) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const [sezioni, regole, ctx] = await Promise.all([
    db.sezione.findMany({ where: { utenteId }, orderBy: { ordine: 'asc' } }),
    db.regola.findMany({ where: { utenteId } }),
    contestoAI(utenteId),
  ])

  const messaggio: MessaggioScaricato = {
    uid: m.uid,
    messageId: m.messageId,
    thread: m.thread,
    mittente: m.mittente,
    mittenteNome: m.mittenteNome,
    destinatari: m.destinatari,
    oggetto: m.oggetto,
    data: m.data,
    anteprima: m.anteprima,
    corpoTesto: m.corpoTesto,
    corpoHtml: m.corpoHtml,
    allegati: m.allegati,
    letto: m.letto,
  }

  const daRegole = applicaRegole(regole, messaggio)
  const mirate = await istruzioniMirate(utenteId, { mittente: m.mittente, messaggioId: m.id })

  // L'AI vede TUTTA la conversazione, non solo l'ultima mail: senza la storia
  // non sa cosa è già stato chiesto o promesso, e crea attività per cose già
  // fatte. Comprende le mail agganciate a mano al thread.
  let precedenti: Messaggio[] = []
  try {
    precedenti = (await messaggiThread(utenteId, m.id)).filter((x) => x.id !== m.id)
  } catch {
    /* senza storia si analizza comunque la singola mail */
  }

  try {
    const analisi = await analizzaMessaggio({
      messaggio,
      sezioni,
      istruzioniAI: [...daRegole.istruzioniAI, ...mirate],
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      firma: ctx.firma,
      oggi: new Date(),
      precedenti: precedenti.map((p) => ({
        direzione: p.direzione,
        mittente: p.mittente,
        mittenteNome: p.mittenteNome,
        oggetto: p.oggetto,
        data: p.data,
        // Se tradotta, all'AI si dà l'italiano: è la versione che capisce meglio.
        corpoTesto: p.corpoTradotto || p.corpoTesto,
      })),
    })

    const sezioneAI = analisi.sezione
      ? (sezioni.find((s) => s.nome === analisi.sezione)?.id ?? null)
      : null
    const sezioneDecisa = m.smistatoDa === 'manuale' || m.smistatoDa === 'regola' || m.smistatoDa === 'spam'

    // Se l'AI ha riconosciuto un appuntamento e non l'hai già messo in agenda,
    // si tiene la proposta: la pagina mostrerà «Aggiungi al calendario».
    let eventoProposto: string | null = null
    if (analisi.evento) {
      try {
        const giaInAgenda = await db.evento.count({ where: { messaggioId: m.id } })
        if (giaInAgenda === 0) eventoProposto = JSON.stringify(analisi.evento)
      } catch {
        eventoProposto = JSON.stringify(analisi.evento)
      }
    }

    await db.messaggio.update({
      where: { id: m.id },
      data: {
        ...(sezioneDecisa ? {} : { sezioneId: sezioneAI, smistatoDa: sezioneAI ? 'ai' : null }),
        riassunto: analisi.riassunto,
        serveRisposta: analisi.serveRisposta,
        eventoProposto,
        analizzatoIl: new Date(),
        erroreAI: null,
      },
    })

    await db.attivita.deleteMany({ where: { messaggioId: m.id, creataDaAI: true, fatta: false } })
    await db.bozza.deleteMany({ where: { messaggioId: m.id, inviata: false } })

    const prioritaAttivita = CODICI_PRIORITA.includes(m.priorita as never) ? m.priorita! : 'P2'
    const attivita = analisi.attivita.length
      ? analisi.attivita
      : [{ titolo: `Gestire: ${m.oggetto}`, dettaglio: analisi.riassunto, scadenza: null, priorita: prioritaAttivita }]

    for (const a of attivita) {
      await db.attivita.create({
        data: {
          utenteId,
          messaggioId: m.id,
          titolo: a.titolo,
          dettaglio: a.dettaglio || null,
          scadenza: a.scadenza ? new Date(a.scadenza) : null,
          priorita: prioritaAttivita,
        },
      })
    }

    if (analisi.serveRisposta && analisi.bozza) {
      await db.bozza.create({
        data: {
          utenteId,
          messaggioId: m.id,
          oggetto: analisi.bozza.oggetto,
          corpo: analisi.bozza.corpo,
          corpoAI: analisi.bozza.corpo,
        },
      })
    }

    const conBozza = analisi.serveRisposta && analisi.bozza ? ' e una bozza di risposta' : ''
    return {
      ok: true,
      messaggio: `${attivita.length === 1 ? 'Attività creata' : `${attivita.length} attività create`}${conBozza}.`,
    }
  } catch (e) {
    const errore = e instanceof Error ? e.message : String(e)
    await db.messaggio.update({ where: { id: m.id }, data: { erroreAI: errore } })
    return { ok: false, messaggio: inItaliano(errore) }
  }
}

function inItaliano(errore: string): string {
  if (errore.includes('429') || errore.includes('quota')) return 'Credito OpenAI esaurito: caricalo e riprova.'
  if (errore.includes('401') || errore.includes('API key')) return 'Chiave OpenAI non valida: controlla OPENAI_API_KEY.'
  if (errore.includes('OPENAI_API_KEY mancante')) return 'Manca la chiave OpenAI: l’analisi è spenta.'
  if (
    /connection error|fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|socket hang up/i.test(errore)
  )
    return 'Connessione a OpenAI non riuscita: riprova fra poco.'
  if (errore.includes('timeout') || errore.includes('ETIMEDOUT') || errore.includes('ECONN')) return 'OpenAI non risponde: riprova fra poco.'
  return errore.length > 120 ? `${errore.slice(0, 120)}…` : errore
}

/** L'AI scrive la mail che porta a termine un'attività, come bozza pronta. */
export async function preparaEsecuzione(
  attivitaId: string,
  utenteId: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const attivita = await db.attivita.findFirst({
    where: { id: attivitaId, utenteId },
    include: { messaggio: true },
  })
  if (!attivita) return { ok: false, messaggio: 'Attività non trovata.' }

  let messaggio = attivita.messaggio
  if (!messaggio && attivita.contattoEmail) {
    messaggio = await db.messaggio.findFirst({
      where: { utenteId, mittente: { equals: attivita.contattoEmail, mode: 'insensitive' }, direzione: 'entrata', cestinato: false },
      orderBy: { data: 'desc' },
    })
  }

  // Attività senza una mail d'origine (es. creata dal dialogo "Nuova attività"):
  // l'AI scrive una mail NUOVA che la porta a termine, e si apre in "Scrivi".
  if (!messaggio) {
    const ctx = await contestoAI(utenteId)
    const recenti = await db.messaggio.findMany({
      where: { utenteId, direzione: 'entrata', cestinato: false },
      orderBy: { data: 'desc' },
      distinct: ['mittente'],
      take: 40,
      select: { mittente: true, mittenteNome: true },
    })

    try {
      const testo = await scriviMailNuova({
        compito: attivita.titolo,
        dettaglio: attivita.dettaglio,
        contatti: recenti.map((r) => ({ email: r.mittente, nome: r.mittenteNome })),
        contestoAzienda: ctx.contestoAzienda,
        stileScrittura: ctx.stileScrittura,
        istruzioni: attivita.contattoEmail
          ? [`Il destinatario è ${attivita.contattoEmail}.`]
          : undefined,
        firma: ctx.firma,
        oggi: new Date(),
      })

      const bozza = await db.bozza.create({
        data: {
          utenteId,
          messaggioId: null,
          origine: 'ai',
          modo: 'nuova',
          a: attivita.contattoEmail || testo.a,
          cc: testo.cc,
          oggetto: testo.oggetto,
          corpo: testo.corpo,
          corpoAI: testo.corpo,
        },
      })

      return { ok: true, messaggio: 'Mail pronta.', vaiA: `/scrivi?bozza=${bozza.id}` }
    } catch (e) {
      return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
    }
  }

  const ctx = await contestoAI(utenteId)
  const mirate = await istruzioniMirate(utenteId, { mittente: messaggio.mittente, messaggioId: messaggio.id })

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito: attivita.titolo,
      dettaglio: attivita.dettaglio,
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      istruzioni: mirate,
      firma: ctx.firma,
      oggi: new Date(),
    })

    const bozza = await db.bozza.create({
      data: {
        utenteId,
        messaggioId: messaggio.id,
        origine: 'ai',
        modo: 'rispondi',
        a: messaggio.mittente,
        oggetto: testo.oggetto,
        corpo: testo.corpo,
        corpoAI: testo.corpo,
      },
    })

    return { ok: true, messaggio: 'Risposta pronta.', vaiA: `/messaggio/${messaggio.id}/scrivi?modo=rispondi&bozza=${bozza.id}` }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * Delega a Renè: gli dai un'istruzione a parole ("declina con garbo", "chiedi
 * il listino") e lui scrive la bozza di risposta a quella mail seguendo lo
 * stile e le istruzioni mirate. Non invia: apre la bozza, la controlli tu.
 */
export async function preparaRispostaDelegata(
  messaggioId: string,
  istruzione: string,
  utenteId: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const compito = istruzione.trim()
  if (!compito) return { ok: false, messaggio: 'Scrivi cosa deve rispondere Renè.' }

  const messaggio = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
  if (!messaggio) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const ctx = await contestoAI(utenteId)
  const mirate = await istruzioniMirate(utenteId, { mittente: messaggio.mittente, messaggioId: messaggio.id })

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito,
      dettaglio: 'Rispondi seguendo esattamente questa indicazione.',
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      istruzioni: mirate,
      firma: ctx.firma,
      oggi: new Date(),
    })

    // Si sostituisce l'eventuale bozza AI precedente su questa mail: ne resta una.
    await db.bozza.deleteMany({ where: { utenteId, messaggioId: messaggio.id, origine: 'ai', inviata: false } })
    const bozza = await db.bozza.create({
      data: {
        utenteId,
        messaggioId: messaggio.id,
        origine: 'ai',
        modo: 'rispondi',
        a: messaggio.mittente,
        oggetto: testo.oggetto,
        corpo: testo.corpo,
        corpoAI: testo.corpo,
      },
    })

    return {
      ok: true,
      messaggio: 'Renè ha preparato la risposta.',
      vaiA: `/messaggio/${messaggio.id}/scrivi?modo=rispondi&bozza=${bozza.id}`,
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

export type QuadroContatto = {
  situazione: string
  taskAperti: string[]
  azioni: { id: string; titolo: string; dettaglio: string | null; priorita: string; scadenza: Date | null }[]
  messaggiVisti: number
  aggiornatoIl: Date
}

/** Il punto della situazione con un contatto dell'utente. */
export async function analizzaContattoOra(
  utenteId: string,
  email: string
): Promise<{ ok: boolean; messaggio: string; quadro?: QuadroContatto }> {
  const messaggi = await db.messaggio.findMany({
    where: {
      utenteId,
      cestinato: false,
      OR: [{ mittente: email }, { direzione: 'uscita', destinatari: { contains: email } }],
    },
    orderBy: { data: 'desc' },
    take: 10,
    select: { data: true, oggetto: true, corpoTesto: true, direzione: true, mittenteNome: true },
  })
  if (messaggi.length === 0) return { ok: false, messaggio: 'Nessun messaggio con questo contatto.' }

  const nome = messaggi.find((m) => m.direzione === 'entrata')?.mittenteNome ?? null
  const ctx = await contestoAI(utenteId)
  const mirate = await istruzioniMirate(utenteId, { mittente: email })

  try {
    const analisi = await riassumiContatto({
      contatto: email,
      nome,
      messaggi: [...messaggi].reverse().map((m) => ({
        daMe: m.direzione === 'uscita',
        data: m.data,
        oggetto: m.oggetto,
        corpo: m.corpoTesto,
      })),
      contestoAzienda: ctx.contestoAzienda,
      istruzioni: mirate,
      oggi: new Date(),
    })

    await db.attivita.deleteMany({ where: { utenteId, contattoEmail: email, creataDaAI: true, fatta: false } })

    const create = []
    for (const a of analisi.azioni) {
      create.push(
        await db.attivita.create({
          data: {
            utenteId,
            contattoEmail: email,
            titolo: a.titolo,
            dettaglio: a.dettaglio || null,
            scadenza: a.scadenza ? new Date(a.scadenza) : null,
            priorita: CODICI_PRIORITA.includes(a.priorita as never) ? a.priorita : 'P2',
          },
        })
      )
    }

    const salvato = await db.riassuntoContatto.upsert({
      where: { utenteId_email: { utenteId, email } },
      create: {
        utenteId,
        email,
        situazione: analisi.situazione,
        taskAperti: analisi.taskAperti.join('\n'),
        messaggiVisti: messaggi.length,
        azioniCreate: analisi.azioni.length,
      },
      update: {
        situazione: analisi.situazione,
        taskAperti: analisi.taskAperti.join('\n'),
        messaggiVisti: messaggi.length,
        azioniCreate: analisi.azioni.length,
      },
    })

    const n = analisi.azioni.length
    return {
      ok: true,
      messaggio:
        n === 0
          ? `Letti ${messaggi.length} messaggi: niente da fare per ora.`
          : `Letti ${messaggi.length} messaggi: ${n === 1 ? '1 azione proposta' : `${n} azioni proposte`} in Attività.`,
      quadro: {
        situazione: analisi.situazione,
        taskAperti: analisi.taskAperti,
        azioni: create.map((a) => ({ id: a.id, titolo: a.titolo, dettaglio: a.dettaglio, priorita: a.priorita, scadenza: a.scadenza })),
        messaggiVisti: messaggi.length,
        aggiornatoIl: salvato.aggiornatoIl,
      },
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

export async function leggiQuadroContatto(utenteId: string, email: string): Promise<QuadroContatto | null> {
  const r = await db.riassuntoContatto.findUnique({ where: { utenteId_email: { utenteId, email } } })
  if (!r) return null
  const azioni = await db.attivita.findMany({
    where: { utenteId, contattoEmail: email, fatta: false },
    orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
  })
  return {
    situazione: r.situazione,
    taskAperti: r.taskAperti.split('\n').filter(Boolean),
    azioni: azioni.map((a) => ({ id: a.id, titolo: a.titolo, dettaglio: a.dettaglio, priorita: a.priorita, scadenza: a.scadenza })),
    messaggiVisti: r.messaggiVisti,
    aggiornatoIl: r.aggiornatoIl,
  }
}

/** Sincronizza una casella: scarica i nuovi messaggi e applica le regole. */
export async function sincronizzaAccount(accountId: string, limite = 25): Promise<EsitoSync> {
  const partenza = Date.now()
  // La Server Action ha 60s su Vercel: il giro si ferma per tempo, il cursore
  // incrementale garantisce che il lavoro fatto resti acquisito.
  const BUDGET_MS = 35_000

  let account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'scarico', account: account.email, scaricati: 0, nonSalvati: 0, scartati: 0 }

  const [regole, prefUtente] = await Promise.all([
    db.regola.findMany({ where: { utenteId: account.utenteId } }),
    db.utente.findUnique({ where: { id: account.utenteId }, select: { traduzioneAuto: true } }),
  ])

  // Quali di questi uid sono già salvati: scaricaNuovi li scavalca senza
  // rifetcharne il corpo (è anche la riparazione di un cursore rimasto indietro).
  const giaPresenti = async (uids: number[]) => {
    const presenti = await db.messaggio.findMany({
      where: { accountId, uid: { in: uids } },
      select: { uid: true },
    })
    return new Set(presenti.map((m) => m.uid))
  }

  // A esaurimento: più blocchi per giro finché c'è arretrato e resta tempo.
  for (let giro = 0; giro < 20; giro++) {
    let nuovi
    try {
      nuovi = await scaricaNuovi(account, limite, giaPresenti)
    } catch (e) {
      const errore = e instanceof Error ? e.message : String(e)
      await db.account.update({ where: { id: account.id }, data: { ultimoErrore: errore, ultimoSync: new Date() } })
      return { ...esito, errore }
    }

    const { primoFallito } = await salvaMessaggi({
      utenteId: account.utenteId,
      accountId: account.id,
      messaggi: nuovi.messaggi,
      regole,
      traduzioneAuto: prefUtente?.traduzioneAuto ?? false,
      dominioProprio: (account.email.split('@')[1] || '').toLowerCase(),
      esito,
      avanzaUltimoUid: true,
    })

    // Solo in avanti (updateMany con condizione): mai regressioni del cursore.
    const ultimoUid = primoFallito !== null ? primoFallito - 1 : nuovi.ultimoUid
    await db.account.updateMany({
      where: { id: account.id, ultimoUid: { lt: ultimoUid } },
      data: { ultimoUid },
    })
    await db.account.update({
      where: { id: account.id },
      data: {
        ...(account.primoUid === 0 && nuovi.primoUid > 0 ? { primoUid: nuovi.primoUid } : {}),
        ultimoSync: new Date(),
        ultimoErrore: null,
      },
    })

    if (primoFallito !== null || nuovi.restanti === 0) break
    // Nessun messaggio recuperato ma arretrato ancora lì: qualcosa non si
    // lascia scaricare, meglio fermarsi che girare a vuoto.
    if (nuovi.messaggi.length === 0) break
    if (Date.now() - partenza > BUDGET_MS) break
    account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  }

  // Niente di nuovo e tempo avanzato? Blocchi di storico a esaurimento: così
  // la posta vecchia arriva da sola, senza dover premere niente, e in fretta
  // (fino a ~35s di scarico per ogni "Aggiorna posta" o giro automatico).
  if (esito.scaricati === 0 && !account.storicoFinito) {
    for (let giro = 0; giro < 10 && Date.now() - partenza < BUDGET_MS; giro++) {
      try {
        const storico = await scaricaStorico(accountId, 40)
        esito.scaricati += storico.scaricati
        if (storico.finito || storico.errore) break
      } catch {
        break // lo storico non deve far fallire il sync
      }
    }
  }

  return esito
}

/** Crea la sezione SPAM dell'utente se non c'è, e ne restituisce l'id. */
export async function assicuraSezioneSpam(utenteId: string): Promise<string> {
  const s = await db.sezione.upsert({
    where: { utenteId_nome: { utenteId, nome: 'SPAM' } },
    create: {
      utenteId,
      nome: 'SPAM',
      descrizione: 'Posta indesiderata: pubblicità non richiesta, phishing e truffe.',
      colore: 'red',
      ordine: 99,
    },
    update: {},
    select: { id: true },
  })
  return s.id
}

async function salvaMessaggi(opts: {
  utenteId: string
  accountId: string
  messaggi: MessaggioScaricato[]
  regole: Regola[]
  traduzioneAuto: boolean
  dominioProprio: string
  esito: EsitoSync
  /** true SOLO per lo scarico dei nuovi: fa avanzare account.ultimoUid man
   *  mano. Lo storico NON deve toccarlo (uid bassi: lo farebbe regredire). */
  avanzaUltimoUid?: boolean
}): Promise<{ primoFallito: number | null }> {
  const { utenteId, accountId, messaggi, regole, traduzioneAuto, dominioProprio, esito } = opts
  let primoFallito: number | null = null

  // Contesto anti-spam, preparato una volta per giro: la sezione SPAM e i
  // contatti col PLUS AI (che non vanno mai marcati spam). Un budget limita le
  // verifiche AI dei casi dubbi, per non spendere troppo in un solo scarico.
  let spamSezioneId: string | null = null
  let emailAI = new Set<string>()
  try {
    spamSezioneId = await assicuraSezioneSpam(utenteId)
    const ai = await db.contattoAI.findMany({ where: { utenteId }, select: { email: true } })
    emailAI = new Set(ai.map((c) => c.email))
  } catch {
    spamSezioneId = null // se qualcosa va storto, semplicemente non si filtra
  }
  // Budget AI per giro di scarico: su Vercel il giro deve chiudersi entro il
  // timeout, quindi le chiamate AI vanno contate. Quello che salta si recupera
  // (spam: resta in posta; traduzione: si fa all'apertura del messaggio).
  let budgetAI = 5
  let budgetTraduzioni = 5

  const filtraSpam = async (msg: MessaggioScaricato, messaggioId: string) => {
    if (!spamSezioneId) return
    const mittBasso = msg.mittente.toLowerCase()
    const dominioMitt = mittBasso.split('@')[1] || ''

    // Chi ti ha già scritto (o a cui hai scritto) è un contatto noto: mai spam.
    const noti = await db.messaggio.count({
      where: {
        utenteId,
        id: { not: messaggioId },
        OR: [{ mittente: msg.mittente }, { direzione: 'uscita', destinatari: { contains: msg.mittente } }],
      },
    })

    const esitoSpam = valutaSpam(
      { oggetto: msg.oggetto, corpoTesto: msg.corpoTesto, mittente: msg.mittente, mittenteNome: msg.mittenteNome },
      {
        contattoNoto: noti > 0,
        dominioProprio: !!dominioMitt && dominioMitt === dominioProprio,
        contattoAI: emailAI.has(mittBasso),
      }
    )

    let spam = esitoSpam.livello === 'alto'
    if (esitoSpam.livello === 'medio' && budgetAI > 0) {
      budgetAI--
      try {
        const g = await giudicaSpam({
          oggetto: msg.oggetto,
          mittente: msg.mittente,
          mittenteNome: msg.mittenteNome,
          corpo: msg.corpoTesto,
          indizi: esitoSpam.motivi,
        })
        spam = g.spam
      } catch {
        spam = false // nel dubbio (AI giù), non nascondere la mail
      }
    }

    if (spam) {
      await db.messaggio.update({
        where: { id: messaggioId },
        data: { sezioneId: spamSezioneId, smistatoDa: 'spam' },
      })
    }
  }

  // Cursore incrementale: su Vercel la funzione può essere uccisa a metà giro
  // (timeout). Se ultimoUid avanzasse solo alla fine, il sync ripartirebbe
  // sempre dallo stesso blocco senza fare mai progresso: quindi si avanza
  // messaggio per messaggio, appena l'esito (salvato o scartato) è definitivo.
  // L'update è MONOTONO (solo in avanti, condizione nel WHERE): mai regressioni,
  // nemmeno con più sync in parallelo.
  let cursore = 0
  const avanzaCursore = async (uid: number) => {
    if (!opts.avanzaUltimoUid || primoFallito !== null || uid <= cursore) return
    cursore = uid
    try {
      await db.account.updateMany({
        where: { id: accountId, ultimoUid: { lt: uid } },
        data: { ultimoUid: uid },
      })
    } catch {
      /* si sistema con l'update finale */
    }
  }

  for (const msg of messaggi) {
    const daRegole = applicaRegole(regole, msg)

    let salvato = false
    for (let tentativo = 0; tentativo < 2 && !salvato; tentativo++) {
      try {
        const esistente = await db.messaggio.findUnique({
          where: { accountId_uid: { accountId, uid: msg.uid } },
        })
        if (esistente) {
          salvato = true
          break
        }

        // Stessa mail arrivata in più copie (alias/inoltri: stesso Message-ID,
        // uid diversi): se ne tiene una sola. Le copie gonfierebbero i thread
        // e creerebbero attività doppie.
        if (msg.messageId) {
          const copia = await db.messaggio.findFirst({
            where: { utenteId, messageId: msg.messageId, direzione: 'entrata' },
            select: { id: true },
          })
          if (copia) {
            salvato = true
            break
          }
        }

        const creato = await db.messaggio.create({
          data: {
            utenteId,
            accountId,
            uid: msg.uid,
            messageId: msg.messageId,
            thread: msg.thread,
            mittente: msg.mittente,
            mittenteNome: msg.mittenteNome,
            destinatari: msg.destinatari,
            oggetto: msg.oggetto,
            data: msg.data,
            anteprima: msg.anteprima,
            corpoTesto: msg.corpoTesto,
            corpoHtml: msg.corpoHtml,
            allegati: msg.allegati,
            letto: msg.letto || daRegole.segnaLetta,
            archiviato: daRegole.archivia,
            sezioneId: daRegole.sezioneId,
            smistatoDa: daRegole.sezioneId ? 'regola' : null,
            regolaId: daRegole.regolaId,
          },
          select: { id: true, direzione: true },
        })
        salvato = true
        esito.scaricati++

        // Traduzione all'arrivo: se attiva, le mail nuove in lingua straniera
        // si traducono subito, così la lista le mostra già in italiano senza
        // doverle aprire. Una traduzione fallita non blocca lo scarico; oltre
        // il budget del giro si traduce comunque all'apertura.
        if (traduzioneAuto && creato.direzione === 'entrata' && budgetTraduzioni > 0) {
          budgetTraduzioni--
          try {
            await traduciMessaggioSeServe(creato.id, utenteId)
          } catch {
            /* si riproverà all'apertura */
          }
        }

        // Filtro anti-spam all'arrivo: solo posta in entrata non già smistata da
        // una regola o archiviata. Un errore qui non deve fermare lo scarico.
        if (creato.direzione === 'entrata' && !daRegole.sezioneId && !daRegole.archivia) {
          try {
            await filtraSpam(msg, creato.id)
          } catch {
            /* niente: la mail resta in posta */
          }
        }

        // Attività su misura definite dalle regole che hanno agganciato la mail.
        if (creato.direzione === 'entrata' && daRegole.attivitaDaCreare.length) {
          for (const titolo of daRegole.attivitaDaCreare) {
            try {
              await db.attivita.create({
                data: { utenteId, messaggioId: creato.id, titolo, creataDaAI: false, priorita: 'P2' },
              })
            } catch {
              /* un'attività fallita non blocca lo scarico */
            }
          }
        }
      } catch (e) {
        if (transitorio(e) && tentativo === 0) {
          await attendi(400)
          continue
        }
        if (transitorio(e)) {
          esito.nonSalvati++
          if (primoFallito === null || msg.uid < primoFallito) primoFallito = msg.uid
        } else {
          esito.scartati++
          console.error(`[AI Mail] messaggio uid ${msg.uid} scartato ("${msg.oggetto}"):`, e instanceof Error ? e.message : e)
        }
        break
      }
    }

    // Esito definitivo (salvato, esistente o scartato): il cursore avanza ORA,
    // così un eventuale timeout non butta via il lavoro fatto fin qui.
    await avanzaCursore(msg.uid)
  }

  return { primoFallito }
}

export async function scaricaStorico(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'storico', account: account.email, scaricati: 0, nonSalvati: 0, scartati: 0 }

  if (account.storicoFinito) return { ...esito, finito: true }

  let primoUid = account.primoUid
  if (primoUid === 0) {
    const piuVecchio = await db.messaggio.findFirst({
      where: { accountId: account.id },
      orderBy: { uid: 'asc' },
      select: { uid: true },
    })
    if (!piuVecchio) return { ...esito, errore: 'Prima scarica la posta recente con “Aggiorna posta”.' }
    primoUid = piuVecchio.uid
    await db.account.update({ where: { id: account.id }, data: { primoUid } })
  }

  let vecchi
  try {
    vecchi = await scaricaVecchi({ ...account, primoUid }, limite)
  } catch (e) {
    return { ...esito, errore: e instanceof Error ? e.message : String(e) }
  }

  const [regole, prefUtente] = await Promise.all([
    db.regola.findMany({ where: { utenteId: account.utenteId } }),
    db.utente.findUnique({ where: { id: account.utenteId }, select: { traduzioneAuto: true } }),
  ])
  const { primoFallito } = await salvaMessaggi({
    utenteId: account.utenteId,
    accountId: account.id,
    messaggi: vecchi.messaggi,
    regole,
    traduzioneAuto: prefUtente?.traduzioneAuto ?? false,
    dominioProprio: (account.email.split('@')[1] || '').toLowerCase(),
    esito,
  })

  if (primoFallito === null) {
    await db.account.update({
      where: { id: account.id },
      data: { primoUid: vecchi.primoUid, storicoFinito: vecchi.finito },
    })
  }

  return { ...esito, finito: primoFallito === null && vecchi.finito }
}

// ---------- Thread (conversazioni) ----------

export type RiassuntoThreadSalvato = {
  chiave: string
  analisi: AnalisiThread
  partecipanti: number
  messaggiVisti: number
  generatoIl: Date
}

/**
 * Tutti i messaggi del thread a cui appartiene un dato messaggio, dal più
 * vecchio al più recente. Riusa lo STESSO raggruppamento della posta in arrivo
 * (catena di risposte + oggetto specifico), così la conversazione mostrata è
 * identica a quella raggruppata in lista. Include anche la posta inviata.
 */
export async function messaggiThread(utenteId: string, messaggioId: string): Promise<Messaggio[]> {
  // Finestra di candidati (leggera): id/thread/oggetto/data bastano a raggruppare.
  const candidati = await db.messaggio.findMany({
    where: { utenteId, cestinato: false },
    orderBy: { data: 'desc' },
    take: 400,
    select: { id: true, thread: true, oggetto: true, data: true, threadManuale: true },
  })

  const dentroFinestra = candidati.some((c) => c.id === messaggioId)
  if (!dentroFinestra) {
    // Messaggio fuori dalla finestra recente: lo restituiamo da solo, ma le
    // mail agganciate a mano vanno recuperate comunque (sono una scelta
    // esplicita e possono essere vecchie quanto si vuole).
    const solo = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
    if (!solo) return []
    if (!solo.threadManuale) return [solo]
    return db.messaggio.findMany({
      where: { utenteId, cestinato: false, threadManuale: solo.threadManuale },
      orderBy: { data: 'asc' },
    })
  }

  const gruppi = raggruppa(candidati)
  const gruppo = gruppi.find((g) => g.some((m) => m.id === messaggioId))
  const ids = new Set((gruppo ?? []).map((m) => m.id))
  if (ids.size === 0) return []

  // Le mail agganciate a mano entrano SEMPRE, anche se più vecchie della
  // finestra dei 400 candidati.
  const manuali = [...new Set((gruppo ?? []).map((m) => m.threadManuale).filter(Boolean))] as string[]
  if (manuali.length > 0) {
    const fuoriFinestra = await db.messaggio.findMany({
      where: { utenteId, cestinato: false, threadManuale: { in: manuali } },
      select: { id: true },
    })
    for (const m of fuoriFinestra) ids.add(m.id)
  }

  const messaggi = await db.messaggio.findMany({
    where: { id: { in: [...ids] }, utenteId },
    orderBy: { data: 'asc' },
  })
  return messaggi
}

function contaPartecipanti(messaggi: Messaggio[]): number {
  const chi = new Set<string>()
  for (const m of messaggi) {
    if (m.direzione === 'uscita') chi.add('me')
    else chi.add(m.mittente.toLowerCase())
  }
  return chi.size
}

/**
 * L'AI legge tutta la conversazione e ne fa il quadro "per punti di vista":
 * cosa vuole/dice ogni parte, cosa resta in sospeso. Salvato per riletture.
 */
export async function riassumiThreadOra(
  utenteId: string,
  messaggioId: string
): Promise<{ ok: boolean; messaggio: string; riassunto?: RiassuntoThreadSalvato }> {
  const messaggi = await messaggiThread(utenteId, messaggioId)
  if (messaggi.length === 0) return { ok: false, messaggio: 'Conversazione non trovata.' }

  const ctx = await contestoAI(utenteId)
  const chiave = chiaveThread(messaggi)
  const partecipanti = contaPartecipanti(messaggi)
  const primo = messaggi.find((m) => m.direzione === 'entrata')
  const mirate = await istruzioniMirate(utenteId, {
    mittente: primo?.mittente ?? null,
    messaggioId: messaggi[0]?.id,
  })

  try {
    const analisi = await riassumiThread({
      messaggi: messaggi.map((m) => ({
        daMe: m.direzione === 'uscita',
        chi: m.mittenteNome || m.mittente,
        data: m.data,
        oggetto: m.oggetto,
        // Se tradotta, si dà all'AI l'italiano.
        corpo: m.corpoTradotto || m.corpoTesto,
      })),
      contestoAzienda: ctx.contestoAzienda,
      istruzioni: mirate,
      oggi: new Date(),
    })

    const salvato = await db.riassuntoThread.upsert({
      where: { utenteId_chiave: { utenteId, chiave } },
      create: {
        utenteId,
        chiave,
        riassunto: JSON.stringify(analisi),
        partecipanti,
        messaggiVisti: messaggi.length,
      },
      update: {
        riassunto: JSON.stringify(analisi),
        partecipanti,
        messaggiVisti: messaggi.length,
        generatoIl: new Date(),
      },
    })

    return {
      ok: true,
      messaggio: `Letti ${messaggi.length} messaggi di ${partecipanti} ${partecipanti === 1 ? 'parte' : 'parti'}.`,
      riassunto: { chiave, analisi, partecipanti, messaggiVisti: messaggi.length, generatoIl: salvato.generatoIl },
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/** Il riassunto salvato di un thread, se c'è. */
export async function leggiRiassuntoThread(
  utenteId: string,
  chiave: string
): Promise<RiassuntoThreadSalvato | null> {
  let r
  try {
    // La tabella potrebbe non esistere ancora in produzione (migrazione da
    // applicare): in quel caso si degrada a "nessun riassunto salvato".
    r = await db.riassuntoThread.findUnique({ where: { utenteId_chiave: { utenteId, chiave } } })
  } catch {
    return null
  }
  if (!r) return null
  let analisi: AnalisiThread
  try {
    analisi = JSON.parse(r.riassunto) as AnalisiThread
  } catch {
    return null
  }
  return {
    chiave: r.chiave,
    analisi,
    partecipanti: r.partecipanti,
    messaggiVisti: r.messaggiVisti,
    generatoIl: r.generatoIl,
  }
}

/** Tutte le caselle attive di tutti gli utenti — per il cron. */
export async function sincronizzaTutti(): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) esiti.push(await sincronizzaAccount(a.id))
  return esiti
}

/** Solo le caselle di un utente — per il pulsante "Aggiorna posta". */
export async function sincronizzaUtente(utenteId: string): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { utenteId, attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) esiti.push(await sincronizzaAccount(a.id))
  return esiti
}
