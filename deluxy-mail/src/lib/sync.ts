import type { Messaggio, Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, cercaSulServer, trovaCartellaInviata, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { leggiSenzaTraduzione, lingueLetteDi } from './lingue'
import {
  analizzaMessaggio,
  riassumiContatto,
  scriviRisposta,
  scriviMailNuova,
  estraiAppuntamento,
  rilevaETraduci,
  riassumiThread,
  giudicaSpam,
  type AnalisiThreadVista,
} from './ai'
import { CHIAVI, leggiImpostazioni, STILE_DEFAULT } from './impostazioni'
import { CODICI_PRIORITA } from './format'
import { raggruppa, chiaveThread } from './thread'
import { prefissa, inoltrato } from './rispondi'
import { elencoContatti } from './contatti'
import { valutaSpam } from './spam'
import { notificaNuoveMail } from './push'
import { rilevaLingua } from './rilevaLingua'

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
): Promise<{ contestoAzienda?: string; firma?: string; stileScrittura?: string; guidaGestione?: string }> {
  const [impostazioni, utente] = await Promise.all([
    leggiImpostazioni(),
    db.utente.findUnique({ where: { id: utenteId }, select: { firma: true } }),
  ])
  return {
    contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
    firma: utente?.firma || undefined,
    // Lo stile lo decide Renè (referente): se non impostato, il default educato.
    stileScrittura: impostazioni[CHIAVI.stileScrittura]?.trim() || STILE_DEFAULT,
    // La guida su come gestire i tipi di richiesta (per l'analisi).
    guidaGestione: impostazioni[CHIAVI.guidaGestione]?.trim() || undefined,
  }
}

/**
 * Crea un'attività SOLO se non ne esiste già una identica e da fare per lo
 * stesso messaggio (stesso titolo).
 *
 * ⚠️ Perché serve: l'analisi cancella-e-ricrea le attività in due passi non
 * atomici. Se due analisi si sovrappongono (es. il lettore AI in sottofondo
 * mentre tu dai una priorità) entrambe cancellano e poi ricreano → doppioni.
 * Questo controllo rende la creazione idempotente e chiude quella corsa.
 */
async function creaAttivitaUnica(dati: {
  utenteId: string
  messaggioId?: string | null
  titolo: string
  dettaglio?: string | null
  scadenza?: Date | null
  priorita?: string
  creataDaAI?: boolean
}): Promise<void> {
  if (dati.messaggioId) {
    const esiste = await db.attivita.findFirst({
      where: { utenteId: dati.utenteId, messaggioId: dati.messaggioId, titolo: dati.titolo, fatta: false },
      select: { id: true },
    })
    if (esiste) return
  }
  await db.attivita.create({
    data: {
      utenteId: dati.utenteId,
      messaggioId: dati.messaggioId ?? null,
      titolo: dati.titolo,
      dettaglio: dati.dettaglio ?? null,
      scadenza: dati.scadenza ?? null,
      priorita: dati.priorita ?? 'P2',
      ...(dati.creataDaAI === false ? { creataDaAI: false } : {}),
    },
  })
}

/**
 * Analizza un messaggio con l'AI quando gli dai una priorità. Tutto ciò che
 * tocca (sezioni, regole, attività) è dell'utente proprietario del messaggio.
 */
export async function analizzaMessaggioOra(
  messaggioId: string,
  utenteId: string,
  // 'priorita' = l'hai chiesto tu dando una priorità: garantisce almeno un
  // promemoria. 'auto' = lettura in sottofondo dei contatti/thread AI+: legge
  // e riassume, ma crea un'attività SOLO se l'AI ne trova davvero una (niente
  // task-tappabuchi «Gestire: …» per ogni mail).
  origine: 'priorita' | 'auto' = 'priorita'
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
      istruzioniAI: [
        ...daRegole.istruzioniAI,
        ...mirate,
        ...(ctx.guidaGestione ? [`Guida di gestione (come trattare i tipi di richiesta):\n${ctx.guidaGestione}`] : []),
      ],
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
    // Fallback «Gestire: …» SOLO se l'hai chiesto tu con una priorità. In lettura
    // automatica (AI+) si creano solo le attività che l'AI ha trovato: leggere
    // una mail non deve riempire la lista di cose da fare.
    const attivita =
      analisi.attivita.length > 0
        ? analisi.attivita
        : origine === 'priorita'
          ? [{ titolo: `Gestire: ${m.oggetto}`, dettaglio: analisi.riassunto, scadenza: null, priorita: prioritaAttivita }]
          : []

    for (const a of attivita) {
      await creaAttivitaUnica({
        utenteId,
        messaggioId: m.id,
        titolo: a.titolo,
        dettaglio: a.dettaglio || null,
        scadenza: a.scadenza ? new Date(a.scadenza) : null,
        priorita: prioritaAttivita,
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
    // Rubrica completa: se il compito nomina i destinatari, l'AI li risolve qui.
    const rubrica = await elencoContatti(utenteId)

    try {
      const testo = await scriviMailNuova({
        compito: attivita.titolo,
        dettaglio: attivita.dettaglio,
        contatti: rubrica.map((c) => ({ email: c.email, nome: c.nome })),
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
      // Qui non si carica il thread: la mail d'origine basta a sé.
      lingua: await linguaPerRisposta(messaggio),
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
/**
 * Il TESTO che Renè scriverebbe, senza creare bozze né spostarsi di pagina:
 * serve a «Chiedi a Renè» dentro la schermata di scrittura, dove la mail la
 * stai già componendo e vuoi solo che te la scriva (o riscriva) lui.
 *
 * Differenza da `preparaRispostaDelegata`: quella prepara una bozza e ti porta
 * altrove; qui torna il corpo e basta, così finisce nell'editor aperto.
 */
export async function testoRispostaRene(
  messaggioId: string,
  istruzione: string,
  utenteId: string,
  bozzaAttuale?: string
): Promise<{ ok: boolean; messaggio: string; corpo?: string }> {
  const compito = istruzione.trim()
  if (!compito) return { ok: false, messaggio: 'Scrivi cosa deve dire Renè.' }

  const messaggio = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
  if (!messaggio) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const ctx = await contestoAI(utenteId)
  const mirate = await istruzioniMirate(utenteId, { mittente: messaggio.mittente, messaggioId: messaggio.id })
  const thread = await messaggiThread(utenteId, messaggio.id)
  const rubrica = await elencoContatti(utenteId)

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito,
      // Se c'è già del testo scritto, Renè lo tiene presente: «rendilo più
      // formale» o «aggiungi i prezzi» deve lavorare su quello, non da zero.
      dettaglio: bozzaAttuale?.trim()
        ? `Segui esattamente questa indicazione. C'è già una bozza in corso: tienine conto e riscrivila di conseguenza.\n--- BOZZA IN CORSO ---\n${bozzaAttuale.slice(0, 4000)}\n--- FINE BOZZA ---`
        : 'Segui esattamente questa indicazione.',
      thread: thread.map((m) => ({
        direzione: m.direzione,
        mittente: m.mittente,
        mittenteNome: m.mittenteNome,
        data: m.data,
        corpoTesto: m.corpoTesto,
      })),
      // Qui il destinatario l'hai già scelto tu nella schermata: Renè scrive
      // il testo, non decide a chi mandarlo.
      permettiInoltro: false,
      contatti: rubrica.map((c) => ({ email: c.email, nome: c.nome })),
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      istruzioni: mirate,
      firma: ctx.firma,
      lingua: await linguaPerRisposta(messaggio, thread),
      oggi: new Date(),
    })
    return { ok: true, messaggio: 'Renè ha scritto la mail.', corpo: testo.corpo }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * In che lingua va scritta la risposta.
 *
 * ⚠️ `Messaggio.lingua` NON basta: lo riempie solo la traduzione automatica,
 * che chi legge l'inglese tiene spenta — quindi resta null proprio sulle mail
 * straniere. In quel caso si riconosce la lingua dal testo dell'ultima mail
 * RICEVUTA (non dalle nostre risposte, che sono in italiano e ingannavano il
 * modello). Deterministico, nessuna chiamata AI.
 */
async function linguaPerRisposta(
  messaggio: { lingua: string | null; corpoTesto: string; direzione: string },
  thread?: { direzione: string; corpoTesto: string }[]
): Promise<string | null> {
  if (messaggio.lingua) return messaggio.lingua
  // Il testo su cui decidere: questa mail se è in entrata, altrimenti l'ultima
  // ricevuta della conversazione.
  const inEntrata =
    messaggio.direzione === 'entrata'
      ? messaggio.corpoTesto
      : [...(thread ?? [])].reverse().find((m) => m.direzione === 'entrata')?.corpoTesto
  return rilevaLingua(inEntrata ?? messaggio.corpoTesto)
}

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

  // La conversazione intera (non solo l'ultima mail), così Renè riprende il
  // thread e risponde a ciò che è rimasto in sospeso.
  const thread = await messaggiThread(utenteId, messaggio.id)
  // La RUBRICA completa (fino a 200 contatti), non solo i mittenti recenti: se il
  // compito dice di mandare/recap a persone precise ("a Renato, Eleonora e
  // Martina"), Renè deve poter risolvere quei nomi in indirizzi.
  const rubrica = await elencoContatti(utenteId)

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito,
      dettaglio: 'Segui esattamente questa indicazione.',
      thread: thread.map((m) => ({
        direzione: m.direzione,
        mittente: m.mittente,
        mittenteNome: m.mittenteNome,
        data: m.data,
        corpoTesto: m.corpoTesto,
      })),
      permettiInoltro: true,
      contatti: rubrica.map((c) => ({ email: c.email, nome: c.nome })),
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      istruzioni: mirate,
      firma: ctx.firma,
      lingua: await linguaPerRisposta(messaggio, thread),
      oggi: new Date(),
    })

    // Si sostituisce l'eventuale bozza AI precedente su questa mail: ne resta una.
    await db.bozza.deleteMany({ where: { utenteId, messaggioId: messaggio.id, origine: 'ai', inviata: false } })

    if (testo.modo === 'inoltra') {
      // Inoltro: oggetto "Fwd: …", nota di Renè + originale citato sotto, come un
      // inoltro fatto a mano. Il destinatario è quello trovato tra i contatti (o
      // vuoto: lo sceglie l'utente).
      const corpoInoltro = `${testo.corpo}\n${inoltrato(messaggio)}`
      const bozza = await db.bozza.create({
        data: {
          utenteId,
          messaggioId: messaggio.id,
          origine: 'ai',
          modo: 'inoltra',
          a: testo.a || '',
          oggetto: prefissa(messaggio.oggetto, 'Fwd'),
          corpo: corpoInoltro,
          corpoAI: corpoInoltro,
        },
      })
      return {
        ok: true,
        messaggio: testo.a
          ? `Renè ha preparato l’inoltro a ${testo.a}.`
          : 'Renè ha preparato l’inoltro: scegli tu a chi mandarlo.',
        vaiA: `/messaggio/${messaggio.id}/scrivi?modo=inoltra&bozza=${bozza.id}`,
      }
    }

    // Se il compito indicava destinatari precisi (recap/mail a persone in
    // rubrica), Renè li ha messi in `testo.a`: si usano QUELLI. Altrimenti è una
    // risposta normale a chi ha scritto.
    const destinatari = testo.a?.trim() || messaggio.mittente
    const aAltri = destinatari.toLowerCase() !== messaggio.mittente.toLowerCase()
    const bozza = await db.bozza.create({
      data: {
        utenteId,
        messaggioId: messaggio.id,
        origine: 'ai',
        modo: 'rispondi',
        a: destinatari,
        oggetto: testo.oggetto,
        corpo: testo.corpo,
        corpoAI: testo.corpo,
      },
    })

    return {
      ok: true,
      messaggio: aAltri ? `Renè ha preparato la mail per ${destinatari}.` : 'Renè ha preparato la risposta.',
      vaiA: `/messaggio/${messaggio.id}/scrivi?modo=rispondi&bozza=${bozza.id}`,
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/** "YYYY-MM-DDTHH:MM" (ora italiana) → istante UTC. */
function oraItalianaInUtcSync(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [Y, M, G, h, min] = [m[1], m[2], m[3], m[4] ?? '00', m[5] ?? '00'].map(Number)
  const utcBase = Date.UTC(Y, M - 1, G, h, min)
  const inRoma = new Date(utcBase).toLocaleString('en-US', { timeZone: 'Europe/Rome' })
  const offset = utcBase - new Date(`${inRoma} UTC`).getTime()
  return new Date(utcBase + offset)
}

/**
 * Delega a Renè un appuntamento: da una mail (e un'eventuale indicazione, es.
 * "la call è giovedì alle 15") ricava data/ora/luogo e lo mette in calendario,
 * legato alla mail. Se non c'è una data certa, non inventa: lo dice.
 */
export async function preparaEventoDelegato(
  messaggioId: string,
  indicazione: string,
  utenteId: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const messaggio = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
  if (!messaggio) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const imp = await leggiImpostazioni()

  try {
    const ev = await estraiAppuntamento({
      messaggio,
      indicazione,
      contestoAzienda: imp[CHIAVI.contestoAzienda],
      oggi: new Date(),
    })
    if (!ev.trovato || !ev.inizio) {
      return { ok: false, messaggio: ev.nota || 'Non ho trovato una data certa: aggiungila tu in Calendario.' }
    }

    const inizio = ev.giornataIntera
      ? new Date(`${ev.inizio.slice(0, 10)}T00:00:00Z`)
      : oraItalianaInUtcSync(ev.inizio)
    if (!inizio || isNaN(inizio.getTime())) {
      return { ok: false, messaggio: 'La data ricavata non è valida: aggiungila tu in Calendario.' }
    }
    const fine = !ev.giornataIntera && ev.fine ? oraItalianaInUtcSync(ev.fine) : null

    await db.evento.create({
      data: {
        utenteId,
        titolo: ev.titolo || messaggio.oggetto,
        luogo: ev.luogo || '',
        inizio,
        fine: fine && fine > inizio ? fine : null,
        giornataIntera: ev.giornataIntera,
        messaggioId: messaggio.id,
        creatoDaAI: true,
      },
    })

    const quando = inizio.toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      day: 'numeric',
      month: 'short',
      ...(ev.giornataIntera ? {} : { hour: '2-digit', minute: '2-digit' }),
    })
    return { ok: true, messaggio: `In agenda: «${ev.titolo}» il ${quando}.`, vaiA: '/calendario' }
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
export async function sincronizzaAccount(
  accountId: string,
  limite = 25,
  // `esaurisci`: true (cron) svuota nuovi + storico fino a ~35s. false (il
  // pulsante / auto-refresh) fa un giro BREVE — solo posta nuova, niente
  // storico — così l'interfaccia non resta bloccata durante la lettura. Il
  // cursore incrementale garantisce che il resto si recuperi ai giri dopo.
  esaurisci = true
): Promise<EsitoSync> {
  const partenza = Date.now()
  const BUDGET_MS = esaurisci ? 35_000 : 7_000

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

  // Lo storico si scarica solo nei giri COMPLETI (cron): nel giro breve
  // (pulsante/auto) lo saltiamo, così la lettura è rapida e non blocca la UI.
  if (esaurisci && esito.scaricati === 0 && !account.storicoFinito) {
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
              await creaAttivitaUnica({ utenteId, messaggioId: creato.id, titolo, creataDaAI: false, priorita: 'P2' })
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

/**
 * Salva i messaggi INVIATI scaricati dal server (cartella "Inviata") come
 * direzione 'uscita'. Dedup per messageId: le copie fatte dall'app hanno lo
 * stesso messageId ma uid negativo — a quelle si aggiorna l'uid a quello reale
 * (così diventano cancellabili dal server). Niente regole/spam/analisi.
 */
async function salvaInviati(utenteId: string, accountId: string, messaggi: MessaggioScaricato[]): Promise<number> {
  let salvati = 0
  for (const m of messaggi) {
    try {
      // SOLO fra gli inviati (direzione 'uscita'): non deve mai toccare una mail
      // in entrata con lo stesso Message-ID (aggiornarne l'uid la corromperebbe).
      const esistente = m.messageId
        ? await db.messaggio.findFirst({
            where: { accountId, messageId: m.messageId, direzione: 'uscita' },
            select: { id: true, uid: true },
          })
        : null
      if (esistente) {
        if (esistente.uid <= 0 && m.uid > 0) {
          // L'uid reale può collidere con quello di una mail in entrata (spazi di
          // numerazione diversi per cartella): in tal caso si lascia com'è.
          try {
            await db.messaggio.updateMany({ where: { id: esistente.id }, data: { uid: m.uid } })
          } catch {
            /* collisione uid: si tiene l'uid attuale */
          }
        }
        continue
      }
      await db.messaggio.create({
        data: {
          utenteId,
          accountId,
          uid: m.uid,
          messageId: m.messageId,
          thread: m.thread,
          direzione: 'uscita',
          mittente: m.mittente,
          mittenteNome: m.mittenteNome,
          destinatari: m.destinatari,
          oggetto: m.oggetto,
          data: m.data,
          anteprima: m.anteprima,
          corpoTesto: m.corpoTesto,
          corpoHtml: m.corpoHtml,
          allegati: m.allegati,
          letto: true,
        },
      })
      salvati++
    } catch {
      /* conflitto uid unico o riga concorrente: si salta */
    }
  }
  return salvati
}

/**
 * Sincronizza la cartella "Inviata": posta inviata NUOVA + (a esaurimento) lo
 * STORICO degli inviati più vecchi. Giri brevi, pensata per girare in
 * background senza bloccare l'app. Se la casella non ha una cartella inviata,
 * non fa nulla.
 */
export async function sincronizzaInviata(accountId: string, esaurisci = false): Promise<EsitoSync> {
  const partenza = Date.now()
  const BUDGET_MS = esaurisci ? 30_000 : 6_000
  let account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'storico', account: account.email, scaricati: 0, nonSalvati: 0, scartati: 0 }

  let cartella = account.cartellaInviata
  if (!cartella) {
    try {
      cartella = await trovaCartellaInviata(account)
      if (cartella) await db.account.update({ where: { id: account.id }, data: { cartellaInviata: cartella } })
    } catch {
      /* rete: si riprova al prossimo giro */
    }
  }
  if (!cartella) return { ...esito, finito: true }

  const giaPresenti = async (uids: number[]) => {
    const presenti = await db.messaggio.findMany({ where: { accountId, uid: { in: uids } }, select: { uid: true } })
    return new Set(presenti.map((m) => m.uid))
  }

  // Inviati NUOVI (uid oltre il cursore della cartella Inviata).
  try {
    const nuovi = await scaricaNuovi(account, 25, giaPresenti, { cartella, ultimoUid: account.ultimoUidInviata })
    esito.scaricati += await salvaInviati(account.utenteId, accountId, nuovi.messaggi)
    if (nuovi.ultimoUid > account.ultimoUidInviata) {
      await db.account.updateMany({
        where: { id: accountId, ultimoUidInviata: { lt: nuovi.ultimoUid } },
        data: { ultimoUidInviata: nuovi.ultimoUid },
      })
    }
    if (account.primoUidInviata === 0 && nuovi.primoUid > 0) {
      await db.account.update({ where: { id: accountId }, data: { primoUidInviata: nuovi.primoUid } })
    }
    account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  } catch (e) {
    return { ...esito, errore: e instanceof Error ? e.message : String(e) }
  }

  // Storico inviati più vecchi (solo a esaurimento): un blocco alla volta.
  if (esaurisci && !account.storicoInviataFinito) {
    for (let giro = 0; giro < 10 && Date.now() - partenza < BUDGET_MS; giro++) {
      try {
        const vecchi = await scaricaVecchi(account, 40, { cartella, primoUid: account.primoUidInviata })
        esito.scaricati += await salvaInviati(account.utenteId, accountId, vecchi.messaggi)
        await db.account.update({
          where: { id: accountId },
          data: { primoUidInviata: vecchi.primoUid, storicoInviataFinito: vecchi.finito },
        })
        if (vecchi.finito || vecchi.messaggi.length === 0) break
        account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
      } catch {
        break
      }
    }
  }

  return esito
}

/**
 * RICERCA ANCHE SUL SERVER: quando l'utente cerca, l'IMAP guarda tutta la
 * casella (anche la posta mai scaricata) e le mail trovate vengono IMPORTATE
 * nel database — così la ricerca locale che segue le vede. INBOX + "Inviata".
 * Best-effort: se un server è lento o non supporta la ricerca, si resta sui
 * risultati locali senza errori.
 */
export async function cercaEImporta(utenteId: string, query: string): Promise<{ importati: number }> {
  const q = query.trim()
  if (q.length < 2) return { importati: 0 }

  const accounts = await db.account.findMany({ where: { utenteId, attivo: true } })
  if (accounts.length === 0) return { importati: 0 }

  const [regole, pref] = await Promise.all([
    db.regola.findMany({ where: { utenteId } }),
    db.utente.findUnique({ where: { id: utenteId }, select: { traduzioneAuto: true } }),
  ])

  let importati = 0
  for (const account of accounts) {
    const giaPresenti = async (uids: number[]) => {
      const presenti = await db.messaggio.findMany({
        where: { accountId: account.id, uid: { in: uids } },
        select: { uid: true },
      })
      return new Set(presenti.map((m) => m.uid))
    }

    // Posta in arrivo (INBOX).
    try {
      const trovate = await cercaSulServer(account, q, giaPresenti)
      if (trovate.length > 0) {
        const esito: EsitoSync = { tipo: 'scarico', account: account.email, scaricati: 0, nonSalvati: 0, scartati: 0 }
        // NIENTE avanzaUltimoUid: gli UID della ricerca sono sparsi, il cursore
        // dei "nuovi" non va toccato.
        await salvaMessaggi({
          utenteId,
          accountId: account.id,
          messaggi: trovate,
          regole,
          traduzioneAuto: pref?.traduzioneAuto ?? false,
          dominioProprio: (account.email.split('@')[1] || '').toLowerCase(),
          esito,
        })
        importati += esito.scaricati
      }
    } catch {
      /* server lento o SEARCH non supportata: restano i risultati locali */
    }

    // Cartella "Inviata" (se nota).
    if (account.cartellaInviata) {
      try {
        const trovate = await cercaSulServer(account, q, giaPresenti, { cartella: account.cartellaInviata })
        if (trovate.length > 0) importati += await salvaInviati(utenteId, account.id, trovate)
      } catch {
        /* idem */
      }
    }
  }

  return { importati }
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
  analisi: AnalisiThreadVista
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
/**
 * I messaggi della conversazione a cui appartiene un messaggio.
 *  - `ampia = false` (predefinito): il thread STRETTO — catena di risposte,
 *    stesso oggetto specifico, agganci manuali.
 *  - `ampia = true`: la vista COMPLETA — al thread aggiunge tutte le mail
 *    scambiate con le stesse persone (le "correlate"), per avere il quadro
 *    intero del rapporto. Deterministico: le persone del thread, non una stima.
 */
export async function messaggiThread(
  utenteId: string,
  messaggioId: string,
  ampia = false
): Promise<Messaggio[]> {
  // Finestra di candidati (leggera): id/thread/oggetto/data bastano a raggruppare.
  const candidati = await db.messaggio.findMany({
    where: { utenteId, cestinato: false },
    orderBy: { data: 'desc' },
    take: 400,
    select: { id: true, thread: true, oggetto: true, data: true, threadManuale: true, scollegato: true },
  })

  const dentroFinestra = candidati.some((c) => c.id === messaggioId)
  const ids = new Set<string>()

  if (!dentroFinestra) {
    // Messaggio fuori dalla finestra recente: lo restituiamo da solo, ma le
    // mail agganciate a mano vanno recuperate comunque (sono una scelta
    // esplicita e possono essere vecchie quanto si vuole).
    const solo = await db.messaggio.findFirst({ where: { id: messaggioId, utenteId } })
    if (!solo) return []
    ids.add(solo.id)
    if (solo.threadManuale) {
      const altre = await db.messaggio.findMany({
        where: { utenteId, cestinato: false, threadManuale: solo.threadManuale },
        select: { id: true },
      })
      for (const m of altre) ids.add(m.id)
    }
  } else {
    const gruppi = raggruppa(candidati)
    const gruppo = gruppi.find((g) => g.some((m) => m.id === messaggioId)) ?? []
    for (const m of gruppo) ids.add(m.id)

    // Le mail agganciate a mano entrano SEMPRE, anche se più vecchie della
    // finestra dei 400 candidati.
    const manuali = [...new Set(gruppo.map((m) => m.threadManuale).filter(Boolean))] as string[]
    if (manuali.length > 0) {
      const fuoriFinestra = await db.messaggio.findMany({
        where: { utenteId, cestinato: false, threadManuale: { in: manuali } },
        select: { id: true },
      })
      for (const m of fuoriFinestra) ids.add(m.id)
    }
  }
  if (ids.size === 0) return []

  // Vista completa: aggiungi le mail scambiate con le stesse persone del thread.
  if (ampia) {
    const base = await db.messaggio.findMany({
      where: { id: { in: [...ids] }, utenteId },
      select: { mittente: true, destinatari: true, direzione: true },
    })
    const mieEmail = new Set(
      (await db.account.findMany({ where: { utenteId }, select: { email: true } })).map((a) => a.email.toLowerCase())
    )
    // Le controparti: chi ci ha scritto e chi abbiamo scritto (tolti i nostri indirizzi).
    const controparti = new Set<string>()
    for (const m of base) {
      if (m.direzione === 'entrata') controparti.add(m.mittente.toLowerCase())
      for (const d of m.destinatari.split(',').map((x) => x.trim().toLowerCase())) {
        if (d && !mieEmail.has(d)) controparti.add(d)
      }
    }
    controparti.delete('')
    for (const e of mieEmail) controparti.delete(e)

    if (controparti.size > 0) {
      const lista = [...controparti]
      const correlate = await db.messaggio.findMany({
        where: {
          utenteId,
          cestinato: false,
          OR: [
            { mittente: { in: lista, mode: 'insensitive' } },
            ...lista.map((e) => ({ destinatari: { contains: e, mode: 'insensitive' as const } })),
          ],
        },
        orderBy: { data: 'desc' },
        take: 60,
        select: { id: true },
      })
      for (const m of correlate) ids.add(m.id)
    }
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

    // Gli indici [n] dell'AI diventano id di messaggio (per i link "apri").
    const idDa = (i: number): string | null =>
      Number.isInteger(i) && i >= 0 && i < messaggi.length ? messaggi[i].id : null
    const vista: AnalisiThreadVista = {
      sintesi: analisi.sintesi,
      parti: analisi.parti.map((p) => ({ chi: p.chi, punto: p.punto, msgId: idDa(p.msgIdx) })),
      inSospeso: analisi.inSospeso.map((s) => ({ cosa: s.cosa, chi: s.chi, msgId: idDa(s.msgIdx) })),
    }

    const salvato = await db.riassuntoThread.upsert({
      where: { utenteId_chiave: { utenteId, chiave } },
      create: {
        utenteId,
        chiave,
        riassunto: JSON.stringify(vista),
        partecipanti,
        messaggiVisti: messaggi.length,
      },
      update: {
        riassunto: JSON.stringify(vista),
        partecipanti,
        messaggiVisti: messaggi.length,
        generatoIl: new Date(),
      },
    })

    return {
      ok: true,
      messaggio: `Letti ${messaggi.length} messaggi di ${partecipanti} ${partecipanti === 1 ? 'parte' : 'parti'}.`,
      riassunto: { chiave, analisi: vista, partecipanti, messaggiVisti: messaggi.length, generatoIl: salvato.generatoIl },
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
  let analisi: AnalisiThreadVista
  try {
    analisi = JSON.parse(r.riassunto) as AnalisiThreadVista
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
  for (const a of account) {
    const prima = new Date()
    const esito = await sincronizzaAccount(a.id)
    esiti.push(esito)
    // Notifica push: è il giro "automatico" (cron), cioè quando l'utente NON è
    // sull'app — il momento giusto per avvisarlo delle mail nuove.
    if (esito.scaricati > 0) {
      try {
        await notificaNuoveMail(a.utenteId, a.id, prima)
      } catch {
        /* le notifiche non devono far fallire la sincronizzazione */
      }
    }
  }
  // Manutenzione periodica (una volta per giro): archivio vecchio → cestino,
  // SPAM molto vecchio → cancellato. Non deve far fallire la sincronizzazione.
  try {
    await manutenzioneRetention()
  } catch {
    /* la manutenzione è best-effort */
  }
  // Sequenze di follow-up: manda i passi in scadenza (stop se hanno risposto).
  // Va DOPO la sincronizzazione: così le risposte appena arrivate fermano le
  // sequenze prima che parta il follow-up.
  try {
    const { processaSequenze } = await import('./sequenze')
    await processaSequenze()
  } catch {
    /* best-effort */
  }
  return esiti
}

// Regole di conservazione della posta (retention). In giorni.
const RETENZIONE = {
  // L'archivio dopo N giorni finisce nel Cestino (resta recuperabile da lì).
  archivioInCestinoGiorni: 30,
  // Lo SPAM dopo N giorni viene cancellato dall'app (definitivo).
  spamCancellaGiorni: 90,
}

/**
 * Pulizia periodica della posta (gira nel cron, per tutti gli utenti):
 *  1. le mail in ARCHIVIO più vecchie di 30 giorni vanno nel CESTINO (di lì si
 *     recuperano ancora, o si svuotano);
 *  2. le mail in SPAM più vecchie di 90 giorni vengono CANCELLATE dall'app.
 * La "data" di riferimento è quella della mail. Idempotente: chi è già stato
 * sistemato non rientra nei filtri.
 */
export async function manutenzioneRetention(): Promise<{ archivioInCestino: number; spamCancellati: number }> {
  const ora = Date.now()
  const soglia = (giorni: number) => new Date(ora - giorni * 24 * 60 * 60 * 1000)

  const arch = await db.messaggio.updateMany({
    where: {
      archiviato: true,
      cestinato: false,
      data: { lt: soglia(RETENZIONE.archivioInCestinoGiorni) },
    },
    data: { cestinato: true, cestinatoIl: new Date() },
  })

  const spam = await db.messaggio.deleteMany({
    where: {
      sezione: { nome: 'SPAM' },
      data: { lt: soglia(RETENZIONE.spamCancellaGiorni) },
    },
  })

  return { archivioInCestino: arch.count, spamCancellati: spam.count }
}

/** Solo le caselle di un utente — per il pulsante "Aggiorna posta".
 *  Giro BREVE (esaurisci=false): legge la posta nuova senza bloccare la UI. */
export async function sincronizzaUtente(utenteId: string): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { utenteId, attivo: true } })
  const esiti: EsitoSync[] = []
  // Solo la posta in ARRIVO nel giro frequente: veloce (una connessione IMAP) e
  // senza toccare la cartella Inviata. Gli inviati si scaricano nel drain di
  // background (impostazione "Scarica tutta la posta di sempre").
  for (const a of account) esiti.push(await sincronizzaAccount(a.id, 25, false))
  return esiti
}
