import { db } from './db'
import { leggiChiaviApp } from './chiaviApp'

// AI Mail manda le sue ATTIVITÀ al registro centralizzato Deluxy Tasks
// (deluxy-tasks): così le cose da fare di una persona si vedono in un posto
// solo, insieme a quelle che arrivano dalle altre app Deluxy.
//
// Come funziona:
// - l'identità della task nel registro è (sistema='mail', idEsterno=id attività):
//   rimandare la stessa attività la AGGIORNA, non la duplica;
// - si mandano le attività ancora da fare più quelle chiuse di recente (le più
//   vecchie e già chiuse non interessano più a nessuno);
// - si manda solo ciò che è CAMBIATO: l'impronta di ogni attività già spedita
//   resta in `Impostazione` (chiave `tasks.inviate`), altrimenti a ogni giro di
//   sincronizzazione si rifarebbero centinaia di chiamate inutili;
// - `asOf` porta il momento in cui l'attività è cambiata QUI. Se nel frattempo
//   qualcuno l'ha chiusa dentro Tasks, il registro riconosce che la nostra
//   scrittura è più vecchia e non la fa regredire (risposta `ignorata_obsoleta`).
//
// La chiave arriva da `chiaviApp.ts` (Impostazioni App → cassaforte del Hub →
// variabile TASKS_API_KEY). Senza chiave l'invio è semplicemente spento: l'app
// funziona come prima.

const TASKS_URL = (process.env.TASKS_URL || 'https://deluxy-tasks.vercel.app').replace(/\/$/, '')
const URL_APP = (process.env.APP_URL || 'https://deluxy-mail.vercel.app').replace(/\/$/, '')

/** Nome con cui AI Mail si presenta al registro (campo `sistema`). */
const SISTEMA = 'mail'

/** Dove teniamo l'impronta di ciò che è già stato spedito. */
const CHIAVE_STATO = 'tasks.inviate'

/** Quanti giorni si continuano a mandare le attività già fatte. */
const GIORNI_COMPLETATE = 7

/** Quante attività al massimo per giro (il cron non deve mai bloccarsi qui). */
const LIMITE_DEFAULT = 300

/** La scala P0…P3 di AI Mail tradotta in quella del registro. */
const PRIORITA_REGISTRO: Record<string, string> = {
  P0: 'urgente',
  P1: 'alta',
  P2: 'media',
  P3: 'bassa',
}

export type EsitoRegistro = {
  attivo: boolean
  inviate: number
  invariate: number
  errori: number
  messaggio?: string
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
    descrizione: a.dettaglio,
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

/**
 * Manda al registro le attività nuove o cambiate. Non lancia mai: se il
 * registro non risponde, la posta continua a funzionare e si riproverà al giro
 * dopo (l'impronta si aggiorna solo quando l'invio è andato a buon fine).
 *
 * `forza: true` rimanda tutto, anche ciò che sembra già a posto (serve al
 * primo allineamento o dopo aver svuotato il registro).
 */
export async function sincronizzaAttivitaConRegistro(
  opzioni: { limite?: number; forza?: boolean } = {},
): Promise<EsitoRegistro> {
  const chiave = await chiaveTasks()
  if (!chiave) {
    return {
      attivo: false,
      inviate: 0,
      invariate: 0,
      errori: 0,
      messaggio: 'Chiave del registro Attività non configurata (Impostazioni App → Tasks).',
    }
  }

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
  let errori = 0

  for (const a of attivita) {
    viste.add(a.id)
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
        continue
      }
      impronte[a.id] = attuale
      inviate++
    } catch {
      errori++
    }
  }

  // Le attività sparite da qui (cancellate) non hanno più bisogno di un'impronta.
  for (const id of Object.keys(impronte)) {
    if (!viste.has(id)) delete impronte[id]
  }
  try {
    await salvaImpronte(impronte)
  } catch {
    /* se non si salva lo stato si rimanda al giro dopo: nessun danno */
  }

  return { attivo: true, inviate, invariate, errori }
}
