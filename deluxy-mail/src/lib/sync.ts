import type { Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { analizzaMessaggio, riassumiContatto, scriviRisposta } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA } from './format'

export type EsitoSync = {
  // 'scarico' = messaggi nuovi presi dalla casella;
  // 'storico' = messaggi vecchi recuperati andando indietro.
  tipo: 'scarico' | 'storico'
  account: string
  scaricati: number
  /** Non salvati per un problema passeggero: si riprovano al giro dopo. */
  nonSalvati: number
  /** Scartati per un problema loro: non si riproveranno più. */
  scartati: number
  /** Solo per 'storico': true quando non c'è più posta vecchia da prendere. */
  finito?: boolean
  errore?: string
}

/** Errori di connessione: passeggeri, vale la pena riprovare. */
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
 * Analizza un messaggio con l'AI: riassunto di cosa c'è da fare, e l'attività
 * corrispondente.
 *
 * NON viene chiamata dallo scarico. Si attiva quando dai una priorità a un
 * messaggio: sei tu a dire "questo conta", e solo allora si spendono token.
 * Scaricare 50 mail al giorno e analizzarle tutte significa pagare l'analisi
 * di newsletter e notifiche che non leggerai mai.
 *
 * La priorità che hai scelto guida l'attività: se hai marcato P0, l'attività
 * nasce P0 — l'urgenza la decidi tu, non il modello.
 */
export async function analizzaMessaggioOra(
  messaggioId: string
): Promise<{ ok: boolean; messaggio: string }> {
  const m = await db.messaggio.findUnique({
    where: { id: messaggioId },
    include: { account: true },
  })
  if (!m) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const [sezioni, regole, impostazioni] = await Promise.all([
    db.sezione.findMany({ orderBy: { ordine: 'asc' } }),
    db.regola.findMany(),
    leggiImpostazioni(),
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

  try {
    const analisi = await analizzaMessaggio({
      messaggio,
      sezioni,
      istruzioniAI: daRegole.istruzioniAI,
      contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
      firma: impostazioni[CHIAVI.firma],
      oggi: new Date(),
    })

    // Una sezione decisa da una regola o spostata a mano non si tocca.
    const sezioneAI = analisi.sezione
      ? (sezioni.find((s) => s.nome === analisi.sezione)?.id ?? null)
      : null
    const sezioneDecisa = m.smistatoDa === 'manuale' || m.smistatoDa === 'regola'

    await db.messaggio.update({
      where: { id: m.id },
      data: {
        ...(sezioneDecisa ? {} : { sezioneId: sezioneAI, smistatoDa: sezioneAI ? 'ai' : null }),
        riassunto: analisi.riassunto,
        serveRisposta: analisi.serveRisposta,
        analizzatoIl: new Date(),
        erroreAI: null,
      },
    })

    // Rifare l'analisi non deve accumulare doppioni di quello che ha già
    // prodotto l'AI; quello che hai scritto o già fatto tu resta.
    await db.attivita.deleteMany({ where: { messaggioId: m.id, creataDaAI: true, fatta: false } })
    await db.bozza.deleteMany({ where: { messaggioId: m.id, inviata: false } })

    // L'attività eredita la priorità del messaggio: l'hai scelta tu.
    const prioritaAttivita = CODICI_PRIORITA.includes(m.priorita as never) ? m.priorita! : 'P2'

    const attivita = analisi.attivita.length
      ? analisi.attivita
      : // Hai dato una priorità: vuol dire che qualcosa da fare c'è. Se l'AI
        // non ha trovato un'azione precisa, l'attività si crea comunque col
        // suo riassunto, invece di lasciarti a mani vuote.
        [
          {
            titolo: `Gestire: ${m.oggetto}`,
            dettaglio: analisi.riassunto,
            scadenza: null,
            priorita: prioritaAttivita,
          },
        ]

    for (const a of attivita) {
      await db.attivita.create({
        data: {
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

/**
 * Gli errori dell'API OpenAI arrivano in inglese e lunghi. In mezzo a una
 * lista di mail servono corti e con scritto cosa fare.
 * L'originale resta comunque su `Messaggio.erroreAI`, per capirci qualcosa.
 */
function inItaliano(errore: string): string {
  if (errore.includes('429') || errore.includes('quota')) {
    return 'Credito OpenAI esaurito: caricalo e riprova.'
  }
  if (errore.includes('401') || errore.includes('API key')) {
    return 'Chiave OpenAI non valida: controlla OPENAI_API_KEY.'
  }
  if (errore.includes('OPENAI_API_KEY mancante')) {
    return 'Manca la chiave OpenAI: l’analisi è spenta.'
  }
  if (errore.includes('timeout') || errore.includes('ETIMEDOUT') || errore.includes('ECONN')) {
    return 'OpenAI non risponde: riprova fra poco.'
  }
  return errore.length > 120 ? `${errore.slice(0, 120)}…` : errore
}

/**
 * Prepara l'esecuzione di un'attività: fa scrivere all'AI la mail che la porta
 * a termine e la lascia come bozza, aperta e pronta da controllare.
 *
 * Non invia niente: "esegui" qui vuol dire "portami al punto in cui basta
 * rileggere e premere invia". Il testo lo scrive il modello, la decisione
 * resta tua.
 */
export async function preparaEsecuzione(
  attivitaId: string
): Promise<{ ok: boolean; messaggio: string; vaiA?: string }> {
  const attivita = await db.attivita.findUnique({
    where: { id: attivitaId },
    include: { messaggio: true },
  })
  if (!attivita) return { ok: false, messaggio: 'Attività non trovata.' }

  // L'attività può venire da una mail precisa o dal punto della situazione con
  // un contatto: in quel caso si risponde al suo messaggio più recente.
  let messaggio = attivita.messaggio
  if (!messaggio && attivita.contattoEmail) {
    messaggio = await db.messaggio.findFirst({
      where: { mittente: attivita.contattoEmail, direzione: 'entrata', cestinato: false },
      orderBy: { data: 'desc' },
    })
  }

  if (!messaggio) {
    return {
      ok: false,
      messaggio: 'Questa attività non nasce da una mail: non c’è nessuno a cui rispondere.',
    }
  }

  const impostazioni = await leggiImpostazioni()

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito: attivita.titolo,
      dettaglio: attivita.dettaglio,
      contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
      firma: impostazioni[CHIAVI.firma],
      oggi: new Date(),
    })

    const bozza = await db.bozza.create({
      data: {
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
      messaggio: 'Risposta pronta.',
      vaiA: `/messaggio/${messaggio.id}/scrivi?modo=rispondi&bozza=${bozza.id}`,
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * Fa il punto della situazione con un contatto: legge le ultime mail scambiate
 * con lui — ricevute e inviate — e ne ricava il quadro, cosa è rimasto aperto
 * e cosa conviene fare.
 *
 * Le azioni proposte diventano attività vere, non righe da guardare: le
 * ritrovi in Attività insieme a tutto il resto e le spunti quando le fai.
 */
export type QuadroContatto = {
  situazione: string
  taskAperti: string[]
  azioni: { id: string; titolo: string; dettaglio: string | null; priorita: string; scadenza: Date | null }[]
  messaggiVisti: number
  aggiornatoIl: Date
}

export async function analizzaContattoOra(
  email: string
): Promise<{ ok: boolean; messaggio: string; quadro?: QuadroContatto }> {
  // Sia quelle di lui sia le mie: il quadro senza le mie risposte sarebbe
  // monco — non si capirebbe chi aspetta cosa.
  const messaggi = await db.messaggio.findMany({
    where: {
      cestinato: false,
      OR: [{ mittente: email }, { direzione: 'uscita', destinatari: { contains: email } }],
    },
    orderBy: { data: 'desc' },
    take: 10,
    select: {
      data: true,
      oggetto: true,
      corpoTesto: true,
      direzione: true,
      mittenteNome: true,
    },
  })

  if (messaggi.length === 0) {
    return { ok: false, messaggio: 'Nessun messaggio con questo contatto.' }
  }

  const nome = messaggi.find((m) => m.direzione === 'entrata')?.mittenteNome ?? null
  const impostazioni = await leggiImpostazioni()

  try {
    const analisi = await riassumiContatto({
      contatto: email,
      nome,
      // Dalla più vecchia alla più recente: una conversazione al contrario non
      // si capisce, e il modello deve seguirne il filo.
      messaggi: [...messaggi].reverse().map((m) => ({
        daMe: m.direzione === 'uscita',
        data: m.data,
        oggetto: m.oggetto,
        corpo: m.corpoTesto,
      })),
      contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
      oggi: new Date(),
    })

    // Rifare il punto sostituisce le azioni proposte prima, che nel frattempo
    // sono vecchie. Quelle già fatte, e quelle scritte da te, restano.
    await db.attivita.deleteMany({
      where: { contattoEmail: email, creataDaAI: true, fatta: false },
    })

    const create = []
    for (const a of analisi.azioni) {
      create.push(
        await db.attivita.create({
          data: {
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
      where: { email },
      create: {
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
        azioni: create.map((a) => ({
          id: a.id,
          titolo: a.titolo,
          dettaglio: a.dettaglio,
          priorita: a.priorita,
          scadenza: a.scadenza,
        })),
        messaggiVisti: messaggi.length,
        aggiornatoIl: salvato.aggiornatoIl,
      },
    }
  } catch (e) {
    return { ok: false, messaggio: inItaliano(e instanceof Error ? e.message : String(e)) }
  }
}

/**
 * Il quadro già calcolato, senza richiamare il modello: riaprire il pannello
 * non deve ripagare l'analisi.
 */
export async function leggiQuadroContatto(email: string): Promise<QuadroContatto | null> {
  const r = await db.riassuntoContatto.findUnique({ where: { email } })
  if (!r) return null

  const azioni = await db.attivita.findMany({
    where: { contattoEmail: email, fatta: false },
    orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
  })

  return {
    situazione: r.situazione,
    taskAperti: r.taskAperti.split('\n').filter(Boolean),
    azioni: azioni.map((a) => ({
      id: a.id,
      titolo: a.titolo,
      dettaglio: a.dettaglio,
      priorita: a.priorita,
      scadenza: a.scadenza,
    })),
    messaggiVisti: r.messaggiVisti,
    aggiornatoIl: r.aggiornatoIl,
  }
}

/**
 * Sincronizza una casella: scarica i nuovi messaggi e applica le regole.
 *
 * Qui l'AI non entra: costa, e la maggior parte della posta non merita
 * un'analisi. La si chiama quando dai una priorità a un messaggio.
 */
export async function sincronizzaAccount(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = {
    tipo: 'scarico',
    account: account.email,
    scaricati: 0,
    nonSalvati: 0,
    scartati: 0,
  }

  let nuovi
  try {
    nuovi = await scaricaNuovi(account, limite)
  } catch (e) {
    const errore = e instanceof Error ? e.message : String(e)
    await db.account.update({
      where: { id: account.id },
      data: { ultimoErrore: errore, ultimoSync: new Date() },
    })
    return { ...esito, errore }
  }

  const regole = await db.regola.findMany()
  const { primoFallito } = await salvaMessaggi({
    accountId: account.id,
    messaggi: nuovi.messaggi,
    regole,
    esito,
  })

  // Il segnalibro non supera mai un messaggio che non si è riusciti a salvare:
  // altrimenti il prossimo scarico ripartirebbe da dopo, e quella mail non
  // verrebbe letta mai più. Meglio riscaricare qualcosa due volte (l'UID già
  // presente si salta da solo) che perderla.
  const ultimoUid = primoFallito !== null ? primoFallito - 1 : nuovi.ultimoUid

  await db.account.update({
    where: { id: account.id },
    data: {
      ultimoUid: Math.max(account.ultimoUid, ultimoUid),
      // primoUid si fissa al primo scarico: da lì in poi si muove solo
      // all'indietro, quando si chiede lo storico.
      ...(account.primoUid === 0 && nuovi.primoUid > 0 ? { primoUid: nuovi.primoUid } : {}),
      ultimoSync: new Date(),
      ultimoErrore: null,
    },
  })

  return esito
}

/**
 * Salva i messaggi nuovi applicando le regole, saltando quelli già presenti.
 *
 * Restituisce l'UID più basso che non si è riusciti a salvare: serve a chi
 * chiama per non spostare in avanti il segnalibro oltre quel punto, altrimenti
 * quel messaggio non verrebbe mai più riletto dalla casella.
 */
async function salvaMessaggi(opts: {
  accountId: string
  messaggi: MessaggioScaricato[]
  regole: Regola[]
  esito: EsitoSync
}): Promise<{ primoFallito: number | null }> {
  const { accountId, messaggi, regole, esito } = opts
  let primoFallito: number | null = null

  for (const msg of messaggi) {
    const daRegole = applicaRegole(regole, msg)

    // Un messaggio che non si salva non deve far saltare tutti gli altri: la
    // connessione al database può cadere per un istante, e il resto dello
    // scarico è comunque buono. Un tentativo, una pausa, un secondo tentativo.
    let salvato = false
    for (let tentativo = 0; tentativo < 2 && !salvato; tentativo++) {
      try {
        // Un UID già presente significa che l'abbiamo già lavorato: si salta.
        const esistente = await db.messaggio.findUnique({
          where: { accountId_uid: { accountId, uid: msg.uid } },
        })
        if (esistente) {
          salvato = true
          break
        }

        await db.messaggio.create({
          data: {
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
        })
        salvato = true
        esito.scaricati++
      } catch (e) {
        if (transitorio(e) && tentativo === 0) {
          await attendi(400)
          continue
        }

        if (transitorio(e)) {
          // Problema di connessione: il segnalibro si ferma qui e il prossimo
          // giro riprende da questo messaggio.
          esito.nonSalvati++
          if (primoFallito === null || msg.uid < primoFallito) primoFallito = msg.uid
        } else {
          // Problema del messaggio, non della connessione: riproverebbe in
          // eterno, bloccando tutta la posta arrivata dopo. Si salta e si va
          // avanti — meglio perdere una mail che la casella.
          esito.scartati++
          console.error(
            `[AI Mail] messaggio uid ${msg.uid} scartato ("${msg.oggetto}"):`,
            e instanceof Error ? e.message : e
          )
        }
        break
      }
    }
  }

  return { primoFallito }
}

/**
 * Scarica un blocco di posta vecchia, andando indietro nel tempo.
 * Come lo scarico normale: prende i messaggi, non li analizza.
 */
export async function scaricaStorico(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = {
    tipo: 'storico',
    account: account.email,
    scaricati: 0,
    nonSalvati: 0,
    scartati: 0,
  }

  if (account.storicoFinito) return { ...esito, finito: true }

  // primoUid può essere 0 su un account collegato prima che questo campo
  // esistesse: lo si ricava dal messaggio più vecchio che abbiamo, altrimenti
  // lo storico si crederebbe finito senza aver scaricato niente.
  let primoUid = account.primoUid
  if (primoUid === 0) {
    const piuVecchio = await db.messaggio.findFirst({
      where: { accountId: account.id },
      orderBy: { uid: 'asc' },
      select: { uid: true },
    })
    if (!piuVecchio) {
      return { ...esito, errore: 'Prima scarica la posta recente con “Aggiorna posta”.' }
    }
    primoUid = piuVecchio.uid
    await db.account.update({ where: { id: account.id }, data: { primoUid } })
  }

  let vecchi
  try {
    vecchi = await scaricaVecchi({ ...account, primoUid }, limite)
  } catch (e) {
    return { ...esito, errore: e instanceof Error ? e.message : String(e) }
  }

  const regole = await db.regola.findMany()
  const { primoFallito } = await salvaMessaggi({
    accountId: account.id,
    messaggi: vecchi.messaggi,
    regole,
    esito,
  })

  // Se qualcosa non si è salvato, il segnalibro dello storico resta dov'è: il
  // prossimo blocco ripassa da qui e recupera. I già salvati si saltano da soli.
  if (primoFallito === null) {
    await db.account.update({
      where: { id: account.id },
      data: { primoUid: vecchi.primoUid, storicoFinito: vecchi.finito },
    })
  }

  return { ...esito, finito: primoFallito === null && vecchi.finito }
}

export async function sincronizzaTutti(): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) esiti.push(await sincronizzaAccount(a.id))
  return esiti
}
