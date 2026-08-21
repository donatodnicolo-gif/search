import { db } from './db'
import { leggiChiaviApp } from './chiaviApp'

// AI Mail e il registro centralizzato Deluxy Tasks (deluxy-tasks): le ATTIVITÀ
// di una persona si vedono in un posto solo, insieme a quelle che arrivano
// dalle altre app Deluxy.
//
// ⚠️ LA SINCRONIZZAZIONE VA NEI DUE SENSI. All'inizio c'era solo l'andata: le
// attività partivano di qui e nel registro arrivavano, ma se qualcuno chiudeva
// una task DENTRO Tasks (o dalla lista condivisa, o da un'altra app) qui
// restava aperta per sempre — due elenchi che dicono cose diverse sono peggio
// di un elenco solo. Ora ogni giro fa prima il RITORNO e poi l'andata:
//
//  1. RITORNO (`tiraDalRegistro`) — si chiede a Tasks «cosa è cambiato da
//     quando ti ho sentito l'ultima volta?» (`/tasks/changes?since=<cursore>`)
//     e si applicano qui stato, scadenza, priorità, titolo e descrizione. Il
//     cursore resta in `Impostazione` (`tasks.cursore`): niente si riscarica
//     due volte e nulla si perde se un giro salta.
//  2. ANDATA (`spingiNelRegistro`) — si mandano le attività nuove o cambiate.
//     L'identità nel registro è (sistema='mail', idEsterno=id attività),
//     quindi rimandare la stessa attività la AGGIORNA, non la duplica. Si
//     manda solo ciò che è CAMBIATO: l'impronta di ogni attività già spedita
//     resta in `Impostazione` (`tasks.inviate`), altrimenti a ogni giro si
//     rifarebbero centinaia di chiamate inutili.
//  3. Le attività CANCELLATE qui vengono archiviate anche là: senza, restavano
//     nell'elenco condiviso per sempre.
//
// ⚠️ NIENTE RIMBALZI. Tasks segna in `ultimoAttore` chi ha scritto per ultimo:
// per le nostre scritture vale 'mail'. Nel ritorno quelle si saltano — sono
// l'eco di ciò che abbiamo appena mandato noi, e riapplicarle farebbe rimbalzare
// la stessa modifica avanti e indietro a ogni giro.
//
// `asOf` porta il momento in cui l'attività è cambiata QUI: se nel frattempo
// qualcuno l'ha toccata dentro Tasks, il registro riconosce che la nostra
// scrittura è più vecchia e non la fa regredire (`ignorata_obsoleta`).
//
// La chiave arriva da `chiaviApp.ts` (Impostazioni App → cassaforte del Hub →
// variabile TASKS_API_KEY). Senza chiave la sincronizzazione è semplicemente
// spenta: l'app funziona come prima.

const TASKS_URL = (process.env.TASKS_URL || 'https://deluxy-tasks.vercel.app').replace(/\/$/, '')
const URL_APP = (process.env.APP_URL || 'https://deluxy-mail.vercel.app').replace(/\/$/, '')

/** Nome con cui AI Mail si presenta al registro (campo `sistema`). */
const SISTEMA = 'mail'

/** Dove teniamo l'impronta di ciò che è già stato spedito. */
const CHIAVE_STATO = 'tasks.inviate'

/** Dove teniamo il punto a cui siamo arrivati a leggere le modifiche di Tasks. */
const CHIAVE_CURSORE = 'tasks.cursore'

/** Quanti giorni si continuano a mandare le attività già fatte. */
const GIORNI_COMPLETATE = 7

/** Quante attività al massimo per giro (il cron non deve mai bloccarsi qui). */
const LIMITE_DEFAULT = 300

/** Quante pagine di modifiche al massimo per giro (il resto al giro dopo). */
const PAGINE_MAX = 5

/** La scala P0…P3 di AI Mail tradotta in quella del registro… */
const PRIORITA_REGISTRO: Record<string, string> = {
  P0: 'urgente',
  P1: 'alta',
  P2: 'media',
  P3: 'bassa',
}
/** …e la strada inversa, per quando è il registro a dirci la priorità. */
const PRIORITA_LOCALE: Record<string, string> = {
  urgente: 'P0',
  alta: 'P1',
  media: 'P2',
  bassa: 'P3',
}

export type EsitoRegistro = {
  attivo: boolean
  /** Andata: attività mandate al registro. */
  inviate: number
  invariate: number
  /** Ritorno: modifiche fatte in Tasks e applicate qui. */
  ricevute: number
  /** Attività cancellate qui e archiviate anche nel registro. */
  archiviate: number
  errori: number
  /**
   * PERCHÉ non è riuscita, in chiaro (la prima volta che va storto).
   *
   * ⚠️ Prima gli errori si contavano e basta: «5 non riuscite» e nient'altro.
   * Ma «non riuscita» ha cause diversissime e indistinguibili da fuori — chiave
   * di sola lettura (403), chiave sbagliata (401), campo rifiutato (400),
   * registro giù — e senza il motivo si finisce a tirare a indovinare. Il
   * registro lo dice, nella risposta: basta riportarlo.
   */
  dettaglioErrore?: string
  /**
   * A quali email sono intestate le task mandate.
   *
   * ⚠️ Serve alla domanda «le ho collegate ma in Tasks non le vedo». Nel
   * registro una task è di una PERSONA (email), e l'elenco che si apre entrando
   * è il proprio: se l'utente di AI Mail ha un'email diversa da quella con cui
   * si entra nel Hub, le task ci sono ma stanno sotto un'altra persona. Senza
   * dirlo, sembra che la sincronizzazione non abbia fatto niente.
   */
  destinatari: string[]
  messaggio?: string
}

/** Il motivo dell'errore come lo dice il registro, corto e leggibile. */
async function motivoErrore(res: Response): Promise<string> {
  let corpo = ''
  try {
    corpo = (await res.text()).slice(0, 200)
  } catch {
    corpo = ''
  }
  try {
    const j = JSON.parse(corpo) as { errore?: string }
    if (j?.errore) corpo = j.errore
  } catch {
    /* non era JSON: si tiene il testo grezzo */
  }
  const aiuto =
    res.status === 403
      ? ' → serve una chiave di SCRITTURA: «npm run chiave -- mail --scrittura» nell’app Tasks.'
      : res.status === 401
        ? ' → la chiave non è valida: rigenerala e reincollala qui.'
        : ''
  return `${res.status} ${corpo}`.trim() + aiuto
}

async function chiaveTasks(): Promise<string> {
  try {
    return (await leggiChiaviApp()).tasks
  } catch {
    return ''
  }
}

/** Per la UI/diagnostica: il registro è collegato? */
export async function registroTaskAttivo(): Promise<boolean> {
  return (await chiaveTasks()).length > 0
}

type AttivitaDaMandare = {
  id: string
  titolo: string
  dettaglio: string | null
  note: string | null
  scadenza: Date | null
  priorita: string
  fatta: boolean
  fattaIl: Date | null
  creataDaAI: boolean
  creataIl: Date
  messaggioId: string | null
  contattoEmail: string | null
  utente: { email: string; nome: string }
  messaggio: { oggetto: string; mittente: string } | null
}

/** Ciò che al registro interessa: se cambia, la task va rimandata. */
function impronta(a: AttivitaDaMandare): string {
  return [
    a.titolo,
    a.dettaglio ?? '',
    a.note ?? '',
    a.priorita,
    a.scadenza?.toISOString() ?? '',
    a.fatta ? '1' : '0',
    a.utente.email,
  ].join('|')
}

function corpoTask(a: AttivitaDaMandare) {
  const link = a.messaggioId ? `${URL_APP}/messaggio/${a.messaggioId}` : `${URL_APP}/attivita`
  return {
    sistema: SISTEMA,
    idEsterno: a.id,
    utenteEmail: a.utente.email,
    utenteNome: a.utente.nome,
    titolo: a.titolo,
    descrizione: [a.dettaglio, a.note && 'Note: ' + a.note].filter(Boolean).join('\n\n') || null,
    stato: a.fatta ? 'completata' : 'aperta',
    priorita: PRIORITA_REGISTRO[a.priorita] ?? 'media',
    scadenza: a.scadenza?.toISOString() ?? null,
    creataDa: a.creataDaAI ? 'AI Mail (dall’AI)' : 'AI Mail',
    link,
    // Da cosa nasce l'attività: la mail, oppure il quadro di un contatto.
    contestoTipo: a.messaggioId ? 'messaggio' : a.contattoEmail ? 'contatto' : null,
    contestoId: a.messaggioId ?? a.contattoEmail,
    contestoEtichetta: a.messaggio?.oggetto ?? a.contattoEmail,
    tag: ['mail'],
    // Momento in cui l'attività è cambiata qui: decide chi vince se anche il
    // registro l'ha toccata.
    asOf: (a.fattaIl ?? a.creataIl).toISOString(),
  }
}

// ---------- lo stato della sincronizzazione (impronte + cursore) ----------

async function leggiImpronte(): Promise<Record<string, string>> {
  try {
    const riga = await db.impostazione.findUnique({ where: { chiave: CHIAVE_STATO } })
    if (!riga?.valore) return {}
    const dati = JSON.parse(riga.valore) as Record<string, string>
    return dati && typeof dati === 'object' ? dati : {}
  } catch {
    return {}
  }
}

async function salvaImpronte(impronte: Record<string, string>): Promise<void> {
  const valore = JSON.stringify(impronte)
  await db.impostazione.upsert({
    where: { chiave: CHIAVE_STATO },
    create: { chiave: CHIAVE_STATO, valore },
    update: { valore },
  })
}

async function leggiCursore(): Promise<number> {
  try {
    const riga = await db.impostazione.findUnique({ where: { chiave: CHIAVE_CURSORE } })
    return Number(riga?.valore) || 0
  } catch {
    return 0
  }
}

async function salvaCursore(cursore: number): Promise<void> {
  const valore = String(cursore)
  await db.impostazione
    .upsert({
      where: { chiave: CHIAVE_CURSORE },
      create: { chiave: CHIAVE_CURSORE, valore },
      update: { valore },
    })
    .catch(() => {
      /* se non si salva si rilegge lo stesso pezzo al giro dopo: nessun danno */
    })
}

// ---------- 1. RITORNO: cosa è cambiato dentro Tasks ----------

/** Una task come la restituisce il registro (solo i campi che ci servono). */
type TaskDalRegistro = {
  id: string
  sistema: string
  idEsterno: string | null
  titolo: string
  descrizione: string | null
  stato: string
  priorita: string
  scadenza: string | null
  completataIl: string | null
  attiva: boolean
  ultimoAttore: string | null
  revisione: number
}

/**
 * Applica qui le modifiche fatte dentro Tasks. Torna quante ne ha applicate.
 * Non lancia mai: se il registro non risponde si riprova al giro dopo, e il
 * cursore resta dov'era.
 */
async function tiraDalRegistro(
  chiave: string
): Promise<{ ricevute: number; errori: number; dettaglio?: string }> {
  let cursore = await leggiCursore()
  let ricevute = 0
  let errori = 0
  let dettaglio: string | undefined

  for (let pagina = 0; pagina < PAGINE_MAX; pagina++) {
    let lotto: { cursore: number; altre: boolean; dati: TaskDalRegistro[] } | null = null
    try {
      const res = await fetch(
        `${TASKS_URL}/api/v1/tasks/changes?since=${cursore}&sistema=${SISTEMA}&perPage=200`,
        {
          headers: { 'x-api-key': chiave },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        }
      )
      if (!res.ok) {
        errori++
        dettaglio ??= `lettura: ${await motivoErrore(res)}`
        break
      }
      lotto = (await res.json()) as { cursore: number; altre: boolean; dati: TaskDalRegistro[] }
    } catch (e) {
      errori++
      dettaglio ??= `lettura: ${(e as Error)?.message ?? 'registro irraggiungibile'}`
      break
    }

    for (const t of lotto.dati ?? []) {
      // ⚠️ L'eco delle nostre stesse scritture si salta: riapplicarla farebbe
      // rimbalzare la stessa modifica avanti e indietro a ogni giro.
      if (t.ultimoAttore === SISTEMA) continue
      if (!t.idEsterno) continue
      try {
        if (await applicaTask(t)) ricevute++
      } catch {
        errori++
      }
    }

    cursore = lotto.cursore ?? cursore
    if (!lotto.altre) break
  }

  await salvaCursore(cursore)
  return { ricevute, errori, dettaglio }
}

/** Riporta su una nostra attività ciò che è cambiato nel registro. */
async function applicaTask(t: TaskDalRegistro): Promise<boolean> {
  const a = await db.attivita.findUnique({
    where: { id: t.idEsterno as string },
    select: { id: true, titolo: true, dettaglio: true, scadenza: true, priorita: true, fatta: true },
  })
  // Attività non nostra o già cancellata qui: niente da riportare.
  if (!a) return false

  // Nel registro «archiviata» e «annullata» valgono quanto «completata»: qui
  // c'è solo fatta sì/no, e in tutti e tre i casi la cosa è chiusa.
  const chiusa = !t.attiva || t.stato === 'completata' || t.stato === 'annullata'
  const scadenza = t.scadenza ? new Date(t.scadenza) : null
  const priorita = PRIORITA_LOCALE[t.priorita] ?? a.priorita
  const dettaglio = t.descrizione ?? null

  const dati: {
    fatta?: boolean
    fattaIl?: Date | null
    scadenza?: Date | null
    priorita?: string
    titolo?: string
    dettaglio?: string | null
  } = {}

  if (chiusa !== a.fatta) {
    dati.fatta = chiusa
    dati.fattaIl = chiusa ? (t.completataIl ? new Date(t.completataIl) : new Date()) : null
  }
  if ((scadenza?.getTime() ?? null) !== (a.scadenza?.getTime() ?? null)) dati.scadenza = scadenza
  if (priorita !== a.priorita) dati.priorita = priorita
  if (t.titolo && t.titolo !== a.titolo) dati.titolo = t.titolo
  if (dettaglio !== (a.dettaglio ?? null)) dati.dettaglio = dettaglio

  if (Object.keys(dati).length === 0) return false
  await db.attivita.update({ where: { id: a.id }, data: dati })
  return true
}

// ---------- 2. ANDATA: le nostre attività al registro ----------

/** Archivia nel registro una task che qui non esiste più (soft delete). */
async function archiviaNelRegistro(chiave: string, idEsterno: string): Promise<boolean> {
  try {
    const res = await fetch(`${TASKS_URL}/api/v1/tasks/by-ref/${SISTEMA}/${encodeURIComponent(idEsterno)}`, {
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const task = (await res.json()) as { id?: string }
    if (!task?.id) return false
    const via = await fetch(`${TASKS_URL}/api/v1/tasks/${task.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return via.ok
  } catch {
    return false
  }
}

/**
 * Allinea SUBITO una sola attività: spuntandola qui, nel registro dev'essere
 * spuntata anche là — aspettare il giro del cron (5 minuti) vorrebbe dire
 * vedere due elenchi che si contraddicono per cinque minuti.
 *
 * `sparita: true` = l'attività è stata cancellata qui, quindi va archiviata là.
 *
 * Best-effort e con un'attesa cortissima: questa funzione sta sul percorso di un
 * clic dell'utente, e il registro non deve MAI far aspettare una spunta. Se non
 * risponde in tempo non è un problema — il giro del cron rimette tutto a posto.
 */
export async function allineaAttivitaOra(id: string, sparita = false): Promise<void> {
  const chiave = await chiaveTasks()
  if (!chiave) return

  const impronte = await leggiImpronte().catch(() => ({}) as Record<string, string>)

  if (sparita) {
    await archiviaNelRegistro(chiave, id)
    delete impronte[id]
    await salvaImpronte(impronte).catch(() => {})
    return
  }

  const a = (await db.attivita.findUnique({
    where: { id },
    select: {
      id: true,
      titolo: true,
      dettaglio: true,
      note: true,
      scadenza: true,
      priorita: true,
      fatta: true,
      fattaIl: true,
      creataDaAI: true,
      creataIl: true,
      messaggioId: true,
      contattoEmail: true,
      utente: { select: { email: true, nome: true } },
      messaggio: { select: { oggetto: true, mittente: true } },
    },
  })) as AttivitaDaMandare | null
  if (!a) return

  try {
    const res = await fetch(`${TASKS_URL}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chiave },
      body: JSON.stringify(corpoTask(a)),
      cache: 'no-store',
      // Corta apposta: meglio rimandare al cron che far aspettare una spunta.
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return
    impronte[a.id] = impronta(a)
    await salvaImpronte(impronte).catch(() => {})
  } catch {
    /* registro lento o giù: ci pensa il giro del cron */
  }
}

/**
 * Sincronizza le attività col registro, nei due sensi. Non lancia mai: se il
 * registro non risponde, la posta continua a funzionare e si riproverà al giro
 * dopo (l'impronta si aggiorna solo quando l'invio è andato a buon fine).
 *
 * `forza: true` rimanda tutto, anche ciò che sembra già a posto (serve al primo
 * allineamento o dopo aver svuotato il registro).
 */
export async function sincronizzaAttivitaConRegistro(
  opzioni: { limite?: number; forza?: boolean; soloAndata?: boolean } = {},
): Promise<EsitoRegistro> {
  const chiave = await chiaveTasks()
  if (!chiave) {
    return {
      attivo: false,
      inviate: 0,
      invariate: 0,
      ricevute: 0,
      archiviate: 0,
      errori: 0,
      destinatari: [],
      messaggio: 'Chiave del registro Attività non configurata (Impostazioni App → Tasks).',
    }
  }

  // ⚠️ Prima il RITORNO, poi l'andata: così ciò che si manda tiene già conto di
  // quello che è successo nel registro, invece di sovrascriverlo.
  const daLoro = opzioni.soloAndata ? { ricevute: 0, errori: 0 } : await tiraDalRegistro(chiave)

  const limite = Math.min(Math.max(opzioni.limite ?? LIMITE_DEFAULT, 1), 1000)
  const dal = new Date(Date.now() - GIORNI_COMPLETATE * 24 * 60 * 60 * 1000)

  const attivita = (await db.attivita.findMany({
    where: { OR: [{ fatta: false }, { fattaIl: { gte: dal } }] },
    select: {
      id: true,
      titolo: true,
      dettaglio: true,
      scadenza: true,
      priorita: true,
      fatta: true,
      fattaIl: true,
      creataDaAI: true,
      creataIl: true,
      messaggioId: true,
      contattoEmail: true,
      utente: { select: { email: true, nome: true } },
      messaggio: { select: { oggetto: true, mittente: true } },
    },
    orderBy: { creataIl: 'desc' },
    take: limite,
  })) as AttivitaDaMandare[]

  const impronte = await leggiImpronte()
  const viste = new Set<string>()
  let inviate = 0
  let invariate = 0
  let archiviate = 0
  let errori = daLoro.errori
  let dettaglioErrore = daLoro.dettaglio
  const destinatari = new Set<string>()

  for (const a of attivita) {
    viste.add(a.id)
    if (a.utente.email) destinatari.add(a.utente.email.toLowerCase())
    const attuale = impronta(a)
    if (!opzioni.forza && impronte[a.id] === attuale) {
      invariate++
      continue
    }
    try {
      const res = await fetch(`${TASKS_URL}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': chiave },
        body: JSON.stringify(corpoTask(a)),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        errori++
        // Il motivo si prende una volta sola: se la chiave è di sola lettura
        // falliranno tutte allo stesso modo, e leggere 300 volte lo stesso
        // corpo di risposta non aggiunge niente.
        dettaglioErrore ??= `invio: ${await motivoErrore(res)}`
        continue
      }
      impronte[a.id] = attuale
      inviate++
    } catch (e) {
      errori++
      dettaglioErrore ??= `invio: ${(e as Error)?.message ?? 'registro irraggiungibile'}`
    }
  }

  // Attività che avevamo mandato e che qui non compaiono più. Due casi molto
  // diversi, e vanno distinti: se è stata CANCELLATA va archiviata anche nel
  // registro (altrimenti resta nell'elenco condiviso per sempre); se è solo
  // uscita dalla finestra — fatta più di una settimana fa — si smette di
  // seguirla e basta, che è tutt'altro.
  const orfane = Object.keys(impronte).filter((id) => !viste.has(id))
  if (orfane.length > 0) {
    let esistenti = new Set<string>()
    try {
      const righe = await db.attivita.findMany({
        where: { id: { in: orfane } },
        select: { id: true },
      })
      esistenti = new Set(righe.map((r) => r.id))
    } catch {
      // Non si sa chi esiste ancora: meglio non archiviare niente per sbaglio.
      esistenti = new Set(orfane)
    }
    for (const id of orfane) {
      if (!esistenti.has(id) && (await archiviaNelRegistro(chiave, id))) archiviate++
      delete impronte[id]
    }
  }

  try {
    await salvaImpronte(impronte)
  } catch {
    /* se non si salva lo stato si rimanda al giro dopo: nessun danno */
  }

  return {
    attivo: true,
    inviate,
    invariate,
    ricevute: daLoro.ricevute,
    archiviate,
    errori,
    dettaglioErrore,
    destinatari: [...destinatari],
  }
}
