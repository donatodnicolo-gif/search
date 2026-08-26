import type { Messaggio, Prisma, Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, cercaSulServer, trovaCartellaInviata, dimensioniDalServer, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { allineaCartellaOra } from './cartelleServer'
import { leggiSenzaTraduzione, lingueLetteDi } from './lingue'
import {
  analizzaMessaggio,
  riassumiContatto,
  scriviRisposta,
  scriviMailNuova,
  estraiAppuntamento,
  rilevaETraduci,
  riassumiThread,
  rispondiSuThread,
  giudicaSpam,
  type AnalisiThreadVista,
  type LivelloRiassunto,
} from './ai'
import { CHIAVI, leggiImpostazioni, STILE_DEFAULT } from './impostazioni'
import { CODICI_PRIORITA } from './format'
import { raggruppa, chiaveThread, normalizzaOggetto, oggettoSpecifico } from './thread'
import { htmlCaldo } from './htmlServer'
import { prefissa, inoltrato } from './rispondi'
import { elencoContatti, contattiPerAI } from './contatti'
import { valutaSpam } from './spam'
import { decisioniSpam } from './spamCasi'
import { notificaNuoveMail } from './push'
import { rilevaLingua } from './rilevaLingua'
import { azioniDalRiassunto } from './appDeluxy'

export type EsitoSync = {
  tipo: 'scarico' | 'storico'
  account: string
  scaricati: number
  nonSalvati: number
  scartati: number
  finito?: boolean
  errore?: string
}

/**
 * ⚠️ DATABASE IN SOLA LETTURA. Postgres risponde `25006 — cannot execute INSERT
 * in a read-only transaction` quando il database non accetta più scritture: su
 * Supabase succede quando il disco è pieno, e resta così finché non si libera
 * spazio. Non è un errore del messaggio: è l'intero database che non scrive.
 *
 * Va riconosciuto a parte perché il danno peggiore non era non ricevere la
 * posta — era **perderla**. Un errore non riconosciuto veniva trattato come
 * «messaggio scartato», ed essendo un esito definitivo il cursore avanzava:
 * quelle mail non sarebbero MAI più state rilette, nemmeno a database tornato
 * a posto. Riconoscendolo, il cursore resta fermo e la posta si riprende tutta
 * appena si può scrivere di nuovo.
 */
export function dbInSolaLettura(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return t.includes('read-only transaction') || t.includes('25006')
}

function transitorio(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return (
    // Il database in sola lettura è un blocco temporaneo, non un messaggio
    // guasto: NON deve mai contare come «scartato» (vedi sopra).
    dbInSolaLettura(e) ||
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
  origine: 'priorita' | 'auto' = 'priorita',
  /**
   * Se scrivere anche la BOZZA DI RISPOSTA.
   *
   * ⚠️ Dal 7/08/2026 dare una priorità **non** prepara più una risposta: era
   * una cosa che partiva da sola su un gesto che voleva dire un'altra cosa
   * («questa è urgente», non «rispondile»). La bozza si chiede col tasto
   * **R+** accanto alle priorità. Qui resta il parametro perché la lettura in
   * sottofondo (AI+) continua a proporla: lì la proposta è il senso stesso
   * della funzione.
   */
  conBozza = true
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
    dimensione: m.dimensione ?? 0,
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

    // ⚠️ IN AGENDA DA SOLO. Se l'AI riconosce un appuntamento con data e ora
    // certe, l'evento si CREA — non si propone e basta. Chiesto il 22/08/2026:
    // «se è una data dell'evento metti già in calendario l'evento».
    //
    // ⚠️ Il prompt è già severo su cosa sia un evento: servono DATA e ORA
    // precise, e «sentiamoci presto» non lo è (vedi SISTEMA). Qui si aggiunge
    // il secondo cancello, quello che il modello non può garantire: la data
    // dev'essere VALIDA una volta convertita. Se non lo è non si inventa niente
    // e si torna alla proposta, che l'utente può guardare.
    //
    // ⚠️ Resta `creatoDaAI: true` e resta legato al messaggio: in Calendario si
    // vede da dove viene e si cancella con un clic. Una cosa messa in agenda da
    // sola dev'essere altrettanto facile da togliere.
    let eventoProposto: string | null = null
    if (analisi.evento) {
      try {
        const giaInAgenda = await db.evento.count({ where: { messaggioId: m.id } })
        if (giaInAgenda === 0) {
          const ev = analisi.evento
          const inizio = ev.giornataIntera
            ? new Date(`${String(ev.inizio).slice(0, 10)}T00:00:00Z`)
            : oraItalianaInUtcSync(ev.inizio)
          if (inizio && !isNaN(inizio.getTime())) {
            const fine = !ev.giornataIntera && ev.fine ? oraItalianaInUtcSync(ev.fine) : null
            await db.evento.create({
              data: {
                utenteId,
                titolo: ev.titolo || m.oggetto,
                luogo: ev.luogo || '',
                inizio,
                fine: fine && fine > inizio ? fine : null,
                giornataIntera: ev.giornataIntera === true,
                messaggioId: m.id,
                creatoDaAI: true,
              },
            })
            // Creato: niente proposta, o la mail chiederebbe di aggiungere una
            // cosa che c'è già.
          } else {
            eventoProposto = JSON.stringify(analisi.evento)
          }
        }
      } catch {
        // Database occupato o data storta: si ripiega sulla proposta, che non
        // scrive niente. Meglio un tasto da premere che un appuntamento perso.
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

    const bozzaScritta = conBozza && analisi.serveRisposta && Boolean(analisi.bozza)
    if (bozzaScritta && analisi.bozza) {
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

    const notaBozza = bozzaScritta ? ' e una bozza di risposta' : ''
    return {
      ok: true,
      messaggio: `${attivita.length === 1 ? 'Attività creata' : `${attivita.length} attività create`}${notaBozza}.`,
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
        contatti: contattiPerAI(rubrica),
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
/**
 * Il BRIEF per una mail NUOVA: si buttano giù i punti, Renè scrive.
 *
 * Non salva niente e non manda niente: torna destinatario, oggetto e testo, che
 * finiscono nei campi della schermata di scrittura. Da lì si correggono come
 * qualunque bozza scritta a mano — è il motivo per cui non passa da `Bozza`.
 *
 * ⚠️ Quello che hai già scritto NON si butta: se nei campi c'è del testo, Renè
 * lo riceve e lo riscrive di conseguenza. Chiedere aiuto a metà lavoro non deve
 * costare il lavoro fatto.
 */
export async function scriviMailDaBrief(
  utenteId: string,
  brief: string,
  gia: { a?: string; oggetto?: string; corpo?: string }
): Promise<{ ok: boolean; messaggio: string; mail?: { a: string; cc: string; oggetto: string; corpo: string } }> {
  const compito = brief.trim()
  if (!compito) return { ok: false, messaggio: 'Scrivi il brief: cosa deve dire la mail.' }

  const ctx = await contestoAI(utenteId)
  const rubrica = await elencoContatti(utenteId)

  const indicazioni: string[] = []
  if (gia.a?.trim()) indicazioni.push(`Il destinatario è già scelto: ${gia.a.trim()}. Non cambiarlo.`)
  if (gia.oggetto?.trim()) indicazioni.push(`Oggetto già scritto (tienilo, o miglioralo appena): ${gia.oggetto.trim()}`)

  try {
    const testo = await scriviMailNuova({
      compito,
      dettaglio: gia.corpo?.trim()
        ? `C'è già del testo scritto: tienine conto e riscrivilo secondo il brief.\n--- TESTO IN CORSO ---\n${gia.corpo.slice(0, 4000)}\n--- FINE ---`
        : null,
      contatti: contattiPerAI(rubrica),
      contestoAzienda: ctx.contestoAzienda,
      stileScrittura: ctx.stileScrittura,
      istruzioni: indicazioni.length ? indicazioni : undefined,
      firma: ctx.firma,
      oggi: new Date(),
    })
    return {
      ok: true,
      messaggio: 'Renè ha scritto: controlla e correggi pure prima di inviare.',
      mail: {
        // Il destinatario scelto da te vince su quello dedotto dall'AI.
        a: gia.a?.trim() || testo.a,
        cc: testo.cc,
        oggetto: gia.oggetto?.trim() || testo.oggetto,
        corpo: testo.corpo,
      },
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

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
      contatti: contattiPerAI(rubrica),
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
      contatti: contattiPerAI(rubrica),
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
      // ⚠️ Il destinatario si cerca in TUTTE le direzioni: `direzione` è la
      // cartella in cui la mail è stata trovata, non chi l'ha scritta — una mail
      // partita da un collega con la casella in copia è «entrata». Col vecchio
      // `direzione: 'uscita'` questo quadro rispondeva «Nessun messaggio con
      // questo contatto» a chi ne aveva.
      OR: [{ mittente: email }, { destinatari: { contains: email } }],
    },
    orderBy: { data: 'desc' },
    take: 10,
    select: { data: true, oggetto: true, corpoTesto: true, direzione: true, mittente: true, mittenteNome: true },
  })
  if (messaggi.length === 0) return { ok: false, messaggio: 'Nessun messaggio con questo contatto.' }

  // ⚠️ Il nome è quello di CHI STIAMO GUARDANDO: si prende dalle mail in cui è
  // lui il mittente. Prendendolo dalla prima «entrata» si finiva col nome del
  // collega che gli ha scritto (misurato: Linn sarebbe diventata «Martina Calia»
  // per l'AI, che poi le si rivolge così).
  const suo = (m: { mittente: string }) => m.mittente.toLowerCase() === email.toLowerCase()
  const nome = messaggi.find((m) => suo(m) && m.mittenteNome)?.mittenteNome ?? null
  const ctx = await contestoAI(utenteId)
  const mirate = await istruzioniMirate(utenteId, { mittente: email })

  try {
    const analisi = await riassumiContatto({
      contatto: email,
      nome,
      messaggi: [...messaggi].reverse().map((m) => ({
        // «daMe» = non l'ha scritta il contatto: dal mittente, non dalla
        // cartella, o il modello attribuisce a lui parole nostre (e viceversa).
        daMe: !suo(m),
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
    // ⚠️ SOLO gli uid di ENTRATA: gli UID sono per-cartella, un inviato con lo
    // stesso uid NON è questa mail (vedi il vincolo unico in schema.prisma).
    const presenti = await db.messaggio.findMany({
      where: { accountId, direzione: 'entrata', uid: { in: uids } },
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

    const { primoFallito, solaLettura } = await salvaMessaggi({
      utenteId: account.utenteId,
      accountId: account.id,
      messaggi: nuovi.messaggi,
      regole,
      traduzioneAuto: prefUtente?.traduzioneAuto ?? false,
      dominioProprio: (account.email.split('@')[1] || '').toLowerCase(),
      esito,
      avanzaUltimoUid: true,
    })

    // ⚠️ Database in sola lettura: si esce SUBITO, senza toccare il cursore e
    // senza provare le altre caselle. E si dice perché: senza questo messaggio
    // l'app sembra semplicemente «inchiodata, non riceve più posta», che è
    // esattamente come è stata vista da fuori.
    if (solaLettura) {
      return {
        ...esito,
        errore:
          'Il database non accetta scritture (sola lettura): su Supabase succede quando lo spazio è esaurito. La posta NON è persa — riprende da sola appena si libera spazio.',
      }
    }

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
}): Promise<{ primoFallito: number | null; solaLettura: boolean }> {
  const { utenteId, accountId, messaggi, regole, traduzioneAuto, dominioProprio, esito } = opts
  let primoFallito: number | null = null
  // Il database non accetta scritture: inutile insistere sugli altri messaggi.
  let solaLettura = false

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

  // Le mail riconosciute come spam ALL'ARRIVO: si spostano nella Posta
  // indesiderata della casella tutte insieme a fine giro, non una per volta
  // (una connessione IMAP invece di una per mail).
  const spostareInSpam: string[] = []

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
        // ⚠️⚠️ Le mail già finite in SPAM non fanno di uno spammer un
        // «contatto noto». Senza questa riga bastava che la PRIMA mail finisse
        // in spam perché la seconda trovasse `noti > 0`, e `valutaSpam` chiude
        // subito il discorso su un contatto noto: il mittente diventava immune.
        // Misurato: 33 mail successive a una in spam sono rimaste in posta per
        // questo motivo, e 15 sarebbero state trattate diversamente.
        // ⚠️⚠️ La forma è `OR` con `sezioneId: null` di proposito: in SQL
        // `sezioneId <> X` è NULL per le righe SENZA sezione, che qui sono la
        // maggioranza — un `not` secco le escluderebbe tutte e la lista bianca
        // smetterebbe di funzionare, riempiendo la posta buona di falsi
        // positivi. (Provato: con il `not` secco i noti crollano da 372 a 1.)
        ...(spamSezioneId
          ? { AND: [{ OR: [{ sezioneId: null }, { sezioneId: { not: spamSezioneId } }] }] }
          : {}),
      },
    })

    const esitoSpam = valutaSpam(
      { oggetto: msg.oggetto, corpoTesto: msg.corpoTesto, mittente: msg.mittente, mittenteNome: msg.mittenteNome },
      {
        contattoNoto: noti > 0,
        dominioProprio: !!dominioMitt && dominioMitt === dominioProprio,
        contattoAI: emailAI.has(mittBasso),
        // I domini nostri: qui si conosce quello della casella in sincronia.
        nostriDomini: dominioProprio ? [dominioProprio] : [],
      }
    )

    let spam = esitoSpam.livello === 'alto'

    // CASISTICA riconosciuta (finge un marchio noto). La prima volta NON si
    // sposta niente: la mail resta in posta con la proposta «è spam?» e
    // un'attività da approvare. Approvata quella casistica, le successive
    // uguali vanno in SPAM da sole — è la richiesta dell'utente: «va in spam
    // dopo approvazione e per le prossime casistiche lo fa in automatico».
    let casoDaChiedere: { id: string; descrizione: string } | null = null
    if (esitoSpam.caso) {
      const d = await decisioniSpam(utenteId)
      if (d.approvate.includes(esitoSpam.caso.id)) spam = true
      else if (!d.rifiutate.includes(esitoSpam.caso.id)) casoDaChiedere = esitoSpam.caso
    }

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
      spostareInSpam.push(messaggioId)
    } else if (casoDaChiedere) {
      // La proposta viaggia su DUE binari: sulla mail (il riquadro con «Sì,
      // è spam» / «No»), e come ATTIVITÀ, così la si ritrova anche senza
      // riaprire quella mail — ed è la «richiesta di approvazione come task».
      // Best-effort: se il salvataggio non riesce, la posta arriva lo stesso.
      try {
        await db.messaggio.update({
          where: { id: messaggioId },
          data: { spamCaso: casoDaChiedere.id, spamMotivo: casoDaChiedere.descrizione },
        })
        await db.attivita.create({
          data: {
            utenteId,
            titolo: `Approva: è spam? ${msg.mittenteNome || msg.mittente} ${casoDaChiedere.descrizione}`,
            dettaglio: `Oggetto: «${msg.oggetto}». Aprendo la mail trovi «Sì, è spam» e «No»: dicendo sì, le prossime uguali finiranno in SPAM da sole.`,
            priorita: 'P2',
            contattoEmail: mittBasso,
            messaggioId,
            creataDaAI: true,
          },
        })
      } catch {
        /* colonne non ancora migrate o attività non creata: la mail resta in posta */
      }
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
        // Solo fra la posta in ARRIVO: il vincolo unico ora è per
        // (accountId, direzione, uid), e questo salvataggio è di sola entrata.
        const esistente = await db.messaggio.findFirst({
          where: { accountId, uid: msg.uid, direzione: 'entrata' },
          select: { id: true },
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
            // L'HTML si tiene in casa solo per la posta RECENTE: per quella
            // vecchia (lo storico) resta sul server e si riprende all'apertura.
            // Senza questo, lo scarico dello storico rigonfierebbe il database
            // che la pulizia ha appena alleggerito (vedi lib/htmlServer.ts).
            corpoHtml: htmlCaldo(msg.data) ? msg.corpoHtml : null,
            allegati: msg.allegati,
            dimensione: msg.dimensione,
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
          // Database in sola lettura: non è QUESTO messaggio a non andare, è che
          // niente si può scrivere. Insistere sugli altri trecento è tempo
          // buttato e riempie i log di errori identici — meglio uscire e dirlo.
          if (dbInSolaLettura(e)) solaLettura = true
        } else {
          esito.scartati++
          console.error(`[AI Mail] messaggio uid ${msg.uid} scartato ("${msg.oggetto}"):`, e instanceof Error ? e.message : e)
        }
        break
      }
    }

    if (solaLettura) {
      console.error(
        '[AI Mail] database in SOLA LETTURA: scarico interrotto. Nessuna mail persa — il cursore resta fermo e si riprende da qui quando il database torna scrivibile.'
      )
      break
    }

    // Esito definitivo (salvato, esistente o scartato): il cursore avanza ORA,
    // così un eventuale timeout non butta via il lavoro fatto fin qui.
    await avanzaCursore(msg.uid)
  }

  // Lo spam riconosciuto all'arrivo se ne va dalla INBOX anche sulla casella:
  // se restasse lì, dal telefono la posta indesiderata continuerebbe a
  // suonare. ⚠️ Best-effort e IN FONDO: qui siamo dentro il cron, che ha già
  // il fiato corto — se non riesce, la mail è comunque nello SPAM di AI Mail.
  if (spostareInSpam.length) {
    try {
      await allineaCartellaOra(utenteId, spostareInSpam, 'normale', 'spam')
    } catch {
      /* il server non ha seguito: si riproverà alla prossima azione su quelle mail */
    }
  }

  return { primoFallito, solaLettura }
}

/**
 * Salva i messaggi INVIATI scaricati dal server (cartella "Inviata") come
 * direzione 'uscita'. Dedup per messageId: le copie fatte dall'app hanno lo
 * stesso messageId ma uid negativo — a quelle si aggiorna l'uid a quello reale
 * (così diventano cancellabili dal server). Niente regole/spam/analisi.
 */
async function salvaInviati(
  utenteId: string,
  accountId: string,
  messaggi: MessaggioScaricato[]
): Promise<{ salvati: number; primoFallito: number | null }> {
  let salvati = 0
  // ⚠️ Il PIÙ PICCOLO uid che ha fallito per un errore TRANSITORIO (DB giù,
  // connessione persa): oltre quello il cursore NON deve avanzare, o quella
  // mail spedita da webmail/telefono non verrebbe mai più riletta — e in
  // silenzio, perché prima l'errore veniva inghiottito (revisione 14/08/2026).
  let primoFallito: number | null = null
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
          // Come per la posta in arrivo: l'HTML resta in casa solo se recente.
          // Questa copia arriva dal server (uid vero), quindi si può riprendere.
          corpoHtml: htmlCaldo(m.data) ? m.corpoHtml : null,
          allegati: m.allegati,
          dimensione: m.dimensione,
          letto: true,
        },
      })
      salvati++
    } catch (e) {
      // Errore TRANSITORIO: si segna l'uid perché il cursore non lo scavalchi
      // (si ritenta al prossimo giro). Errore PERMANENTE (riga guasta,
      // conflitto stabile): si salta, o ci si incaglierebbe per sempre.
      if (transitorio(e) && m.uid > 0) {
        primoFallito = primoFallito === null ? m.uid : Math.min(primoFallito, m.uid)
      }
    }
  }
  return { salvati, primoFallito }
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
    // ⚠️ SOLO gli uid di USCITA: cartella Inviata, numerazione a sé (vedi il
    // vincolo unico in schema.prisma). Un uid uguale in INBOX non è questo.
    const presenti = await db.messaggio.findMany({
      where: { accountId, direzione: 'uscita', uid: { in: uids } },
      select: { uid: true },
    })
    return new Set(presenti.map((m) => m.uid))
  }

  // Inviati NUOVI (uid oltre il cursore della cartella Inviata).
  try {
    const nuovi = await scaricaNuovi(account, 25, giaPresenti, { cartella, ultimoUid: account.ultimoUidInviata })
    const salv = await salvaInviati(account.utenteId, accountId, nuovi.messaggi)
    esito.scaricati += salv.salvati
    // ⚠️ Il cursore non scavalca una mail il cui salvataggio è fallito per un
    // errore transitorio: ci si ferma appena PRIMA, così al prossimo giro la si
    // rilegge. Senza, la mail si perdeva in silenzio.
    const tetto = salv.primoFallito !== null ? Math.min(nuovi.ultimoUid, salv.primoFallito - 1) : nuovi.ultimoUid
    if (tetto > account.ultimoUidInviata) {
      await db.account.updateMany({
        where: { id: accountId, ultimoUidInviata: { lt: tetto } },
        data: { ultimoUidInviata: tetto },
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
        esito.scaricati += (await salvaInviati(account.utenteId, accountId, vecchi.messaggi)).salvati
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
    // ⚠️ DUE controlli distinti: INBOX e Inviata hanno UID indipendenti, e con
    // un solo `giaPresenti` per account un uid uguale nelle due cartelle si
    // annullava a vicenda (una delle due mail non entrava mai).
    const giaPresentiDir = (direzione: 'entrata' | 'uscita') => async (uids: number[]) => {
      const presenti = await db.messaggio.findMany({
        where: { accountId: account.id, direzione, uid: { in: uids } },
        select: { uid: true },
      })
      return new Set(presenti.map((m) => m.uid))
    }

    // Posta in arrivo (INBOX).
    try {
      const trovate = await cercaSulServer(account, q, giaPresentiDir('entrata'))
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
        const trovate = await cercaSulServer(account, q, giaPresentiDir('uscita'), { cartella: account.cartellaInviata })
        if (trovate.length > 0) importati += (await salvaInviati(utenteId, account.id, trovate)).salvati
      } catch {
        /* idem */
      }
    }
  }

  return { importati }
}

/**
 * Riempie la DIMENSIONE REALE delle mail che ne sono prive, chiedendola al
 * server (RFC822.SIZE): è l'unica che conta anche gli allegati. Lavora a
 * blocchi e non scarica alcun contenuto, quindi è veloce anche su archivi
 * grandi. Torna quante ne ha aggiornate (0 = non c'era altro da fare).
 */
export async function ripassaDimensioni(utenteId: string, blocco = 400): Promise<number> {
  let daFare: { id: string; uid: number; accountId: string; direzione: string }[] = []
  try {
    daFare = await db.messaggio.findMany({
      where: { utenteId, dimensione: null, uid: { gt: 0 } },
      orderBy: { data: 'desc' }, // prima le recenti: sono quelle che si guardano
      take: blocco,
      select: { id: true, uid: true, accountId: true, direzione: true },
    })
  } catch {
    return 0
  }
  if (daFare.length === 0) return 0

  // Un giro per account e per cartella: INBOX per la posta ricevuta, «Inviata»
  // per quella spedita. Una sola FETCH di soli SIZE per gruppo.
  const perGruppo = new Map<string, { accountId: string; uscita: boolean; ids: Map<number, string[]> }>()
  for (const m of daFare) {
    const uscita = m.direzione === 'uscita'
    const chiave = `${m.accountId}|${uscita ? 'out' : 'in'}`
    const g = perGruppo.get(chiave) ?? { accountId: m.accountId, uscita, ids: new Map() }
    g.ids.set(m.uid, [...(g.ids.get(m.uid) ?? []), m.id])
    perGruppo.set(chiave, g)
  }

  let aggiornate = 0
  for (const g of perGruppo.values()) {
    const account = await db.account.findUnique({ where: { id: g.accountId } })
    if (!account) continue
    const cartella = g.uscita ? account.cartellaInviata : account.cartella
    if (!cartella) continue
    try {
      const misure = await dimensioniDalServer(account, cartella, [...g.ids.keys()])
      for (const [uid, size] of misure) {
        for (const id of g.ids.get(uid) ?? []) {
          await db.messaggio.update({ where: { id }, data: { dimensione: size } }).catch(() => {})
          aggiornate++
        }
      }
    } catch {
      /* casella non raggiungibile ora: si riprova al giro successivo */
    }
  }
  return aggiornate
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
 * Solo gli ID delle mail della conversazione a cui appartiene un messaggio.
 *
 * ⚠️ PRESTAZIONI. Chi deve solo AGIRE sul thread (cestinare, archiviare,
 * spostare nello SPAM) usa questa, non `messaggiThread`: quest'ultima carica le
 * righe INTERE — corpo testo, corpo HTML e traduzione — e per una conversazione
 * lunga sono megabyte trasportati dal database solo per ricavarne degli id.
 * È il motivo per cui «Cestina tutto» ci metteva un'eternità.
 *
 * Il raggruppamento è lo STESSO della posta in arrivo (catena di risposte +
 * oggetto specifico + agganci manuali), così la conversazione su cui si agisce
 * è identica a quella che si vede in lista.
 */
export async function idsThread(utenteId: string, messaggioId: string): Promise<Set<string>> {
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
    // ⚠️ Messaggio più VECCHIO della finestra recente. Prima si restituiva da
    // solo: aprendolo, la conversazione risultava «questa mail è da sola» e
    // sparivano il nome del thread e «cestina tutta la conversazione», anche
    // quando la conversazione esisteva eccome. I suoi compagni sono vecchi
    // quanto lui e nella finestra non ci sono mai: si vanno a prendere per
    // CATENA (stessa radice), per AGGANCIO manuale e per OGGETTO, e poi si
    // raggruppa con le stesse regole della lista.
    const solo = await db.messaggio.findFirst({
      where: { id: messaggioId, utenteId },
      select: {
        id: true,
        thread: true,
        messageId: true,
        oggetto: true,
        data: true,
        threadManuale: true,
        scollegato: true,
      },
    })
    if (!solo) return ids
    const radice = solo.thread || solo.messageId || solo.id
    const norm = normalizzaOggetto(solo.oggetto)
    const oppure: Prisma.MessaggioWhereInput[] = [{ thread: radice }, { messageId: radice }]
    if (solo.threadManuale) oppure.push({ threadManuale: solo.threadManuale })
    // L'oggetto lega solo se è specifico (le stesse regole di raggruppa): con
    // «info» o «(senza oggetto)» si fonderebbero conversazioni diverse.
    if (oggettoSpecifico(norm.toLowerCase())) oppure.push({ oggetto: { contains: norm, mode: 'insensitive' } })

    const vicini = await db.messaggio.findMany({
      where: { utenteId, cestinato: false, OR: oppure },
      orderBy: { data: 'desc' },
      take: 200,
      select: { id: true, thread: true, oggetto: true, data: true, threadManuale: true, scollegato: true },
    })
    const insieme = [solo, ...vicini.filter((v) => v.id !== solo.id)]
    const gruppo = raggruppa(insieme).find((g) => g.some((m) => m.id === messaggioId)) ?? [solo]
    for (const m of gruppo) ids.add(m.id)

    // Gli agganci manuali entrano SEMPRE per intero (scelta esplicita).
    const manuali = [...new Set(gruppo.map((m) => m.threadManuale).filter(Boolean))] as string[]
    if (manuali.length > 0) {
      const altre = await db.messaggio.findMany({
        where: { utenteId, cestinato: false, threadManuale: { in: manuali } },
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
  return ids
}

/** Una riga della conversazione come serve per MOSTRARLA: niente corpi. */
export type RigaThread = {
  id: string
  mittente: string
  mittenteNome: string | null
  destinatari: string
  direzione: string
  oggetto: string
  anteprima: string
  data: Date
  letto: boolean
  allegati: number
  priorita: string | null
}

/**
 * La conversazione per la PILA della pagina del messaggio: senza i corpi.
 *
 * ⚠️ `messaggiThread` fa un `findMany` senza `select`, quindi trasporta testo,
 * HTML e traduzione di OGNI mail del thread — decine di KB per una
 * conversazione normale, centinaia per una lunga — e la pagina quei testi non
 * li mostra nemmeno: il corpo di un messaggio si chiede quando lo apri. È la
 * stessa trappola già pagata in posta in arrivo («tutto tranne due campi»
 * invece dei campi che servono). `messaggiThread` resta per chi le mail deve
 * LEGGERLE davvero: AI, riassunti, risposte.
 */
export async function righeThread(utenteId: string, messaggioId: string): Promise<RigaThread[]> {
  const ids = await idsThread(utenteId, messaggioId)
  if (ids.size === 0) return []
  return db.messaggio.findMany({
    where: { id: { in: [...ids] }, utenteId },
    orderBy: { data: 'asc' },
    select: {
      id: true,
      mittente: true,
      mittenteNome: true,
      destinatari: true,
      direzione: true,
      oggetto: true,
      anteprima: true,
      data: true,
      letto: true,
      allegati: true,
      priorita: true,
    },
  })
}

/**
 * Le mail della conversazione in forma LEGGERA: solo id e data, dalla più
 * vecchia alla più recente. Basta a ricavarne la chiave (`chiaveThread`) e a
 * segnare nome / PLUS AI / chiusura su tutti i membri — senza trasportare i
 * corpi, come faceva `messaggiThread`.
 */
export async function membriThread(
  utenteId: string,
  messaggioId: string
): Promise<{ id: string; data: Date }[]> {
  const ids = await idsThread(utenteId, messaggioId)
  if (ids.size === 0) return []
  return db.messaggio.findMany({
    where: { id: { in: [...ids] }, utenteId },
    orderBy: { data: 'asc' },
    select: { id: true, data: true },
  })
}

/**
 * I messaggi (INTERI, corpi compresi) della conversazione a cui appartiene un
 * messaggio, dal più vecchio al più recente. Include anche la posta inviata.
 *  - `ampia = false` (predefinito): il thread STRETTO — catena di risposte,
 *    stesso oggetto specifico, agganci manuali.
 *  - `ampia = true`: la vista COMPLETA — al thread aggiunge tutte le mail
 *    scambiate con le stesse persone (le "correlate"), per avere il quadro
 *    intero del rapporto. Deterministico: le persone del thread, non una stima.
 *
 * Serve solo a chi deve LEGGERE le mail (la pagina della conversazione, l'AI).
 * Per agire sul thread c'è `idsThread`, che non trasporta i corpi.
 */
export async function messaggiThread(
  utenteId: string,
  messaggioId: string,
  ampia = false
): Promise<Messaggio[]> {
  const ids = await idsThread(utenteId, messaggioId)
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
/** Il riassunto salvato reso in testo, da dare all'AI come punto di partenza
 *  per l'aggiornamento incrementale. */
export function riassuntoInTesto(v: AnalisiThreadVista): string {
  const parti = v.parti.map((p) => `- ${p.chi}: ${p.punto}`).join('\n')
  const sospesi = v.inSospeso.map((s) => `- ${s.cosa}${s.chi ? ` (da ${s.chi})` : ''}`).join('\n')
  // ⚠️ Anche le cifre: nell'aggiornamento incrementale l'AI riparte da questo
  // testo — un prezzo che non c'è qui sparirebbe dal riassunto aggiornato.
  const cifre = (v.cifre ?? []).map((c) => `- ${c.voce}: ${c.valore}`).join('\n')
  // ⚠️ Anche le AZIONI proposte, per la stessa ragione delle cifre: senza,
  // l'aggiornamento incrementale riparte da un testo che non le nomina, il
  // modello vede solo le due mail nuove e non ha modo di sapere che una
  // trattativa era già stata proposta — i bottoni «Si può fare da qui»
  // sparivano dal riquadro (visto il 26/08/2026).
  const azioni = (v.azioni ?? []).map((a) => `- ${a.azioneId}: ${a.perche}`).join('\n')
  return [
    v.sintesi,
    parti && `\nPer punti di vista:\n${parti}`,
    cifre && `\nCifre e prezzi:\n${cifre}`,
    sospesi && `\nIn sospeso:\n${sospesi}`,
    azioni && `\nAzioni già proposte (riproponile se sono ancora sensate):\n${azioni}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function riassumiThreadOra(
  utenteId: string,
  messaggioId: string,
  livello: LivelloRiassunto = 'medio'
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

  // Riassunto incrementale: se ne esiste già uno fatto su MENO messaggi di ora,
  // si dà all'AI quel riassunto + SOLO le mail nuove, invece di rimacinare tutto
  // il thread. Su una conversazione lunga è molta meno roba da leggere per l'AI.
  // ⚠️ L'incrementale vale solo per il livello MEDIO. Chiedendo «profondo» si
  // vuole che l'AI rilegga tutto: aggiornare un riassunto veloce con due mail
  // nuove darebbe un finto approfondimento, con la parte vecchia rimasta
  // corta. Chi preme quel tasto vuole il lavoro fatto, non il ritocco.
  let precedente: string | undefined
  let daIndice = 0
  // La vista salvata prima di questo giro: serve a non PERDERE le azioni
  // proposte quando il modello, in questo passaggio, non ne nomina nessuna.
  let vistaPrecedente: AnalisiThreadVista | undefined
  try {
    if (livello !== 'medio') throw new Error('incrementale non applicabile')
    const vecchio = await db.riassuntoThread.findUnique({
      where: { utenteId_chiave: { utenteId, chiave } },
      select: { riassunto: true, messaggiVisti: true },
    })
    // Vale solo se restano poche mail nuove: se ne mancano tante (o il vecchio
    // conteggio è incoerente col thread di ora) si rifà tutto, è più sicuro.
    const nuove = vecchio ? messaggi.length - vecchio.messaggiVisti : 0
    if (vecchio && nuove > 0 && vecchio.messaggiVisti > 0 && nuove <= 8) {
      const vista = JSON.parse(vecchio.riassunto) as AnalisiThreadVista
      vistaPrecedente = vista
      precedente = riassuntoInTesto(vista)
      daIndice = vecchio.messaggiVisti
    }
  } catch {
    /* niente riassunto precedente: si fa completo */
  }

  // Anche quando NON si va in incrementale (livello diverso, o nessuna mail
  // nuova) la vista di prima serve: le azioni proposte sono una PORTA, non un
  // fatto, e riassumere di nuovo non è una ragione per chiuderla.
  if (!vistaPrecedente) {
    try {
      const vecchio = await db.riassuntoThread.findUnique({
        where: { utenteId_chiave: { utenteId, chiave } },
        select: { riassunto: true },
      })
      if (vecchio) vistaPrecedente = JSON.parse(vecchio.riassunto) as AnalisiThreadVista
    } catch {
      /* niente vista precedente: si prosegue senza */
    }
  }

  // In incrementale si passano solo le mail dopo l'ultimo riassunto; l'indice
  // GLOBALE resta quello vero (per i link "apri").
  const conIndice = messaggi.map((m, i) => ({
    idx: i,
    daMe: m.direzione === 'uscita',
    chi: m.mittenteNome || m.mittente,
    data: m.data,
    oggetto: m.oggetto,
    corpo: m.corpoTradotto || m.corpoTesto, // se tradotta, l'italiano
  }))

  try {
    // Le azioni proponibili dal riassunto («Apri trattativa» se chiedono un
    // preventivo, «Registra il preventivo» se un fornitore manda un prezzo):
    // il catalogo, con le regole, vive in appDeluxy.
    const proponibili = azioniDalRiassunto()
    const analisi = await riassumiThread({
      messaggi: precedente ? conIndice.slice(daIndice) : conIndice,
      precedente,
      contestoAzienda: ctx.contestoAzienda,
      istruzioni: mirate,
      livello,
      azioniProponibili: proponibili,
      oggi: new Date(),
    })

    // Gli indici [n] dell'AI diventano id di messaggio (per i link "apri").
    const idDa = (i: number): string | null =>
      Number.isInteger(i) && i >= 0 && i < messaggi.length ? messaggi[i].id : null
    // ⚠️ Si tengono solo azioni del catalogo (lo schema le vincola già, ma un
    // id fuori lista non deve poter arrivare a un bottone) e al massimo due.
    const idValidi = new Set(proponibili.map((p) => p.id))
    const azioniVista = (analisi.azioni ?? [])
      .filter((a) => idValidi.has(a.azione))
      .slice(0, 2)
      .map((a) => ({ azioneId: a.azione, perche: a.perche, msgId: idDa(a.msgIdx) }))

    // ⚠️⚠️ Le azioni proposte sono una PORTA verso un'altra app, non un dato
    // della conversazione: se questo giro non ne nomina nessuna si tengono
    // quelle di prima. Rigenerare il riassunto non è una ragione per far
    // sparire un bottone che c'era (segnalato dall'utente il 26/08/2026:
    // «non ho più il richiamo alle app?»), e il modello, in incrementale, ha
    // letto solo le mail nuove: il suo silenzio non è un giudizio.
    // La porta si chiude quando il lavoro è FATTO, e quello si sa per certo:
    // un invio riuscito è registrato in InvioApp.
    let fatte = new Set<string>()
    try {
      const inviate = await db.invioApp.findMany({
        where: { utenteId, esito: 'ok', messaggioId: { in: messaggi.map((m) => m.id) } },
        select: { azioneId: true },
      })
      fatte = new Set(inviate.map((r) => r.azioneId))
    } catch {
      /* storico non leggibile: si preferisce riproporre che nascondere */
    }
    // ⚠️ Le nuove per PRIME, poi quelle di prima che questo giro non ha
    // ripetuto: un giro che ne nomina UNA non è un giudizio sulle altre.
    // «Registra il preventivo» proposta da sola faceva sparire «Apri
    // trattativa», che restava sensata (segnalato dall'utente il 26/08/2026
    // subito dopo la prima correzione, che teneva le vecchie solo quando il
    // giro nuovo era muto del tutto: il silenzio PARZIALE è il caso comune).
    const precedentiNonRipetute = (vistaPrecedente?.azioni ?? []).filter(
      (a) => !azioniVista.some((n) => n.azioneId === a.azioneId)
    )
    const azioniTenute = [...azioniVista, ...precedentiNonRipetute]
      .filter((a) => idValidi.has(a.azioneId) && !fatte.has(a.azioneId))
      .slice(0, 2)
    const cifreVista = (analisi.cifre ?? [])
      .filter((c) => c.voce.trim() && c.valore.trim())
      .map((c) => ({ voce: c.voce, valore: c.valore, msgId: idDa(c.msgIdx) }))
    const vista: AnalisiThreadVista = {
      sintesi: analisi.sintesi,
      parti: analisi.parti.map((p) => ({ chi: p.chi, punto: p.punto, msgId: idDa(p.msgIdx) })),
      inSospeso: analisi.inSospeso.map((s) => ({ cosa: s.cosa, chi: s.chi, msgId: idDa(s.msgIdx) })),
      ...(cifreVista.length ? { cifre: cifreVista } : {}),
      ...(azioniTenute.length ? { azioni: azioniTenute } : {}),
      // Il livello resta scritto: riaprendo si sa se quello che si sta
      // guardando è la sintesi in due righe o il quadro completo.
      livello,
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

/** La risposta a una domanda su una conversazione, con la mail da cui viene. */
export type EsitoDomanda = {
  ok: boolean
  messaggio: string
  trovato?: boolean
  risposta?: string
  citazione?: string
  /** La mail in cui sta la risposta: id per aprirla, più chi e quando. */
  fonte?: { id: string; chi: string; data: Date; oggetto: string } | null
  lette?: number
}

/**
 * «Ci hanno mandato l'IBAN?», «hanno confermato per giovedì?» — una domanda su
 * QUESTA conversazione, con la risposta a schermo.
 *
 * ⚠️ Perché non passa da «Delega Renè»: quella ha due soli esiti, `risposta` o
 * `agenda` (`classificaDelega`), quindi a «c'è l'IBAN?» preparava **una mail
 * che chiede l'IBAN**. Domandare e far scrivere sono due cose diverse.
 *
 * ⚠️ La risposta torna sempre con la **fonte** (mail + parole esatte): su una
 * fattura o una data di consegna un «sì» non verificabile non è usabile. E il
 * «non l'ho trovato» è una risposta legittima, preferita a una plausibile e
 * falsa — la stessa regola per cui qui i dati critici non si deducono.
 *
 * Non si salva niente: è una domanda, non un documento.
 */
export async function rispondiSuThreadOra(
  utenteId: string,
  messaggioId: string,
  domanda: string
): Promise<EsitoDomanda> {
  const pulita = domanda.trim().slice(0, 500)
  if (!pulita) return { ok: false, messaggio: 'Scrivi la domanda.' }

  const messaggi = await messaggiThread(utenteId, messaggioId)
  if (messaggi.length === 0) return { ok: false, messaggio: 'Conversazione non trovata.' }

  const ctx = await contestoAI(utenteId)
  const conIndice = messaggi.map((m, i) => ({
    idx: i,
    daMe: m.direzione === 'uscita',
    chi: m.mittenteNome || m.mittente,
    data: m.data,
    oggetto: m.oggetto,
    corpo: m.corpoTradotto || m.corpoTesto, // se tradotta, l'italiano
  }))

  try {
    const r = await rispondiSuThread({
      domanda: pulita,
      messaggi: conIndice,
      contestoAzienda: ctx.contestoAzienda,
      oggi: new Date(),
    })
    const i = r.msgIdx
    const m = Number.isInteger(i) && i >= 0 && i < messaggi.length ? messaggi[i] : null
    return {
      ok: true,
      messaggio: '',
      // Senza la mail da cui viene, la risposta NON si dichiara trovata: una
      // citazione che non si può aprire vale quanto un'affermazione secca.
      trovato: r.trovato && m !== null,
      risposta: r.risposta,
      citazione: r.citazione,
      fonte: m ? { id: m.id, chi: m.mittenteNome || m.mittente, data: m.data, oggetto: m.oggetto } : null,
      lette: messaggi.length,
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
  // ⚠️ Manutenzione e sequenze IN TESTA, non in coda. Il giro per-account può
  // saturare da solo i 300s del cron (la rotta stessa lo documenta), e in coda
  // non venivano MAI eseguite: i follow-up non partivano e la retention non
  // girava, in silenzio (revisione 14/08/2026). Sono lavori brevi e vanno
  // fatti prima che la lettura posta si mangi tutto il tempo. ⚠️ Costo: le
  // sequenze girano su uno stato posta di un giro fa (una risposta arrivata
  // proprio ora la ferma al giro dopo) — accettabile rispetto a «mai».
  try {
    const pulizia = await manutenzioneRetention()
    // ⚠️ L'esito NON si butta più. Questo giro CANCELLA posta per sempre, ogni
    // cinque minuti, su tutti gli utenti: prima il numero finiva in un
    // `try/catch` muto, e una cancellazione di massa non avrebbe lasciato
    // nessuna traccia da nessuna parte — né una riga di log né un contatore.
    // Un lavoro distruttivo che non si misura non è sorvegliato, è ricordato.
    if (pulizia.archivioInCestino > 0 || pulizia.spamCancellati > 0) {
      console.log(
        `[retention] archivio nel cestino: ${pulizia.archivioInCestino} · spam cancellati: ${pulizia.spamCancellati}`
      )
    }
  } catch (e) {
    console.log('[retention] non riuscita:', e instanceof Error ? e.message : String(e))
  }
  try {
    const { processaSequenze } = await import('./sequenze')
    await processaSequenze()
  } catch {
    /* best-effort */
  }

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
  return esiti
}

// Regole di conservazione della posta (retention). In giorni.
const RETENZIONE = {
  // L'archivio dopo N giorni finisce nel Cestino. **0 = SPENTO**, ed è spento.
  //
  // ⚠️ SPENTO IL 20/08/2026, dopo aver contato i danni. La catena era:
  // 54 regole archiviano da sole all'arrivo → dopo 30 giorni la mail finisce
  // nel cestino → e dal 14/08 lo spostamento segue anche sulla CASELLA. Nel
  // cestino si erano accumulate **1.073 mail finite lì da sole** accanto a **15**
  // buttate da una persona, indistinguibili a schermo. Siccome «Svuota cestino»
  // cancella dal server in modo IRREVERSIBILE e cancella tutto il cestino, un
  // solo clic avrebbe distrutto mille mail archiviate.
  //
  // ⚠️ La lezione, prima ancora del numero: **archiviare non è buttare**. Chi
  // archivia sta mettendo da parte per ritrovare, e nella webmail dell'utente
  // esistono cartelle Archivio 2023/2024/2025 — l'archivio lì è un deposito di
  // anni. Una scadenza che trasforma «da parte» in «nel cestino», in silenzio e
  // pure sul server, non è una pulizia: è una perdita di dati differita.
  // Se un giorno la si riaccende, NON deve rispecchiarsi sulla casella e il
  // cestino deve distinguere chi ci è finito da solo da chi ce l'ha messo una
  // persona.
  archivioInCestinoGiorni: 0,
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

  // ⚠️ A BLOCCHI e con gli ID in mano, NON un updateMany cieco. Marcare
  // `cestinato` senza spostare la mail nel Cestino della CASELLA la lasciava in
  // INBOX sul server, mentre `cartellaDiMessaggio` la cercava ormai nel Trash:
  // aprendola, impaginato e allegati «spariti» (o, peggio, quelli di un'altra
  // mail con lo stesso uid nel Trash). Trovato in revisione il 14/08/2026.
  // Il tetto tiene corto il giro del cron; l'operazione è idempotente, quindi
  // un arretrato grande si smaltisce in più giri.
  const TETTO = 100
  // ⚠️ 0 = SPENTA, e va controllato PRIMA di calcolare la soglia: `soglia(0)`
  // e 'adesso', quindi `data < adesso` prenderebbe TUTTO l'archivio e lo
  // cestinerebbe al primo giro — l'esatto contrario di spegnere la regola.
  const daCestinare = RETENZIONE.archivioInCestinoGiorni <= 0 ? [] : await db.messaggio.findMany({
    where: {
      archiviato: true,
      cestinato: false,
      data: { lt: soglia(RETENZIONE.archivioInCestinoGiorni) },
    },
    select: { id: true, utenteId: true },
    take: TETTO,
  })

  if (daCestinare.length > 0) {
    await db.messaggio.updateMany({
      where: { id: { in: daCestinare.map((m) => m.id) } },
      data: { cestinato: true, cestinatoIl: new Date() },
    })
    // Il server segue: si spostano nel Cestino della casella (partenza 'auto',
    // perché una potrebbe essere in SPAM). Raggruppate per utente. Best-effort:
    // se il server non risponde, in AI Mail sono comunque a posto.
    const perUtente = new Map<string, string[]>()
    for (const m of daCestinare) {
      const g = perUtente.get(m.utenteId) ?? []
      g.push(m.id)
      perUtente.set(m.utenteId, g)
    }
    for (const [utenteId, ids] of perUtente) {
      try {
        await allineaCartellaOra(utenteId, ids, 'auto', 'cestino')
      } catch {
        /* il server non ha seguito: si riproverà */
      }
    }
  }

  // ⚠️⚠️ `creatoIl` (quando la mail è ENTRATA nell'app), non `data` (quando è
  // stata SPEDITA). È la differenza fra «sta in spam da 90 giorni» e «è stata
  // scritta più di 90 giorni fa», e qui la seconda lettura era una mina:
  // il 71% dei messaggi entra nell'app già più vecchio di 90 giorni (storico
  // scaricato, ricerche sul server), quindi **segnare come spam una mail
  // vecchia la cancellava per sempre entro cinque minuti** — senza passare
  // dal cestino, senza tetto, e senza guardare se l'aveva marcata una persona
  // (oggi 101 dei 163 messaggi in SPAM sono `smistatoDa: manuale`).
  // ⚠️ E niente la ripesca: `cercaEImporta` guarda INBOX e Inviata, non la
  // cartella Spam del server.
  // ⚠️ Il TETTO come il ramo qui sopra: una cancellazione senza limite, ogni
  // cinque minuti, su tutti gli utenti, è troppo potere per un giro muto.
  const daCancellare =
    RETENZIONE.spamCancellaGiorni <= 0
      ? []
      : await db.messaggio.findMany({
          where: {
            sezione: { nome: 'SPAM' },
            creatoIl: { lt: soglia(RETENZIONE.spamCancellaGiorni) },
          },
          select: { id: true },
          take: TETTO,
        })
  const spam =
    daCancellare.length > 0
      ? await db.messaggio.deleteMany({ where: { id: { in: daCancellare.map((m) => m.id) } } })
      : { count: 0 }

  return { archivioInCestino: daCestinare.length, spamCancellati: spam.count }
}

/** Solo le caselle di un utente — per il pulsante "Aggiorna posta".
 *  Giro BREVE (esaurisci=false): legge la posta nuova senza bloccare la UI. */
export async function sincronizzaUtente(utenteId: string): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { utenteId, attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) {
    esiti.push(await sincronizzaAccount(a.id, 25, false))
    // ⚠️ ANCHE GLI INVIATI, a ogni giro. Prima no: la cartella «Inviata» la
    // guardava solo lo scarico dello storico, in background e su richiesta.
    // Conseguenza vista il 9/08/2026 («mancano alcune mail inviate»): tutto
    // quello che mandi da un ALTRO programma — webmail, telefono — restava
    // fuori da AI Mail, anche per giorni. Le mail scritte da qui si salvano da
    // sole all'invio, ed è per questo che il buco non si notava.
    // Il giro è corto per costruzione (`esaurisci = false`): solo gli uid oltre
    // il cursore, al massimo 25, una connessione. Lo storico vecchio resta al
    // drain di background, che ha il suo budget.
    try {
      esiti.push(await sincronizzaInviata(a.id, false))
    } catch {
      /* la posta in arrivo è già stata letta: un inciampo sugli inviati non
         deve far sembrare fallito tutto il giro */
    }
  }
  return esiti
}
