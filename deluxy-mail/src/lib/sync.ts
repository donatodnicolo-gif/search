import type { Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { analizzaMessaggio, riassumiContatto, scriviRisposta } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA } from './format'

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

/** Il contesto aziendale (condiviso) e la firma personale dell'utente. */
async function contestoAI(utenteId: string): Promise<{ contestoAzienda?: string; firma?: string }> {
  const [impostazioni, utente] = await Promise.all([
    leggiImpostazioni(),
    db.utente.findUnique({ where: { id: utenteId }, select: { firma: true } }),
  ])
  return { contestoAzienda: impostazioni[CHIAVI.contestoAzienda], firma: utente?.firma || undefined }
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

  try {
    const analisi = await analizzaMessaggio({
      messaggio,
      sezioni,
      istruzioniAI: daRegole.istruzioniAI,
      contestoAzienda: ctx.contestoAzienda,
      firma: ctx.firma,
      oggi: new Date(),
    })

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
      where: { utenteId, mittente: attivita.contattoEmail, direzione: 'entrata', cestinato: false },
      orderBy: { data: 'desc' },
    })
  }
  if (!messaggio) {
    return { ok: false, messaggio: 'Questa attività non nasce da una mail: non c’è nessuno a cui rispondere.' }
  }

  const ctx = await contestoAI(utenteId)

  try {
    const testo = await scriviRisposta({
      messaggio,
      compito: attivita.titolo,
      dettaglio: attivita.dettaglio,
      contestoAzienda: ctx.contestoAzienda,
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
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'scarico', account: account.email, scaricati: 0, nonSalvati: 0, scartati: 0 }

  let nuovi
  try {
    nuovi = await scaricaNuovi(account, limite)
  } catch (e) {
    const errore = e instanceof Error ? e.message : String(e)
    await db.account.update({ where: { id: account.id }, data: { ultimoErrore: errore, ultimoSync: new Date() } })
    return { ...esito, errore }
  }

  const regole = await db.regola.findMany({ where: { utenteId: account.utenteId } })
  const { primoFallito } = await salvaMessaggi({
    utenteId: account.utenteId,
    accountId: account.id,
    messaggi: nuovi.messaggi,
    regole,
    esito,
  })

  const ultimoUid = primoFallito !== null ? primoFallito - 1 : nuovi.ultimoUid
  await db.account.update({
    where: { id: account.id },
    data: {
      ultimoUid: Math.max(account.ultimoUid, ultimoUid),
      ...(account.primoUid === 0 && nuovi.primoUid > 0 ? { primoUid: nuovi.primoUid } : {}),
      ultimoSync: new Date(),
      ultimoErrore: null,
    },
  })

  return esito
}

async function salvaMessaggi(opts: {
  utenteId: string
  accountId: string
  messaggi: MessaggioScaricato[]
  regole: Regola[]
  esito: EsitoSync
}): Promise<{ primoFallito: number | null }> {
  const { utenteId, accountId, messaggi, regole, esito } = opts
  let primoFallito: number | null = null

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

        await db.messaggio.create({
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
        })
        salvato = true
        esito.scaricati++
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

  const regole = await db.regola.findMany({ where: { utenteId: account.utenteId } })
  const { primoFallito } = await salvaMessaggi({
    utenteId: account.utenteId,
    accountId: account.id,
    messaggi: vecchi.messaggi,
    regole,
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
