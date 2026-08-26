import { db } from './db'
import { leggiChiaviApp } from './chiaviApp'

// AI Mail e il calendario centralizzato Deluxy Calendario: gli APPUNTAMENTI di
// una persona si vedono in un posto solo, insieme a consegne, scadenze e a tutto
// ciò che ha una data nelle altre app Deluxy.
//
// È il gemello esatto di `registroTask.ts` — stessa architettura, applicata agli
// eventi datati invece che alle attività — e vale la stessa lezione: la
// sincronizzazione va nei DUE SENSI, altrimenti restano due agende che si
// contraddicono. Ogni giro fa prima il ritorno e poi l'andata:
//
//  1. RITORNO — `/eventi/changes?since=<cursore>&sistema=mail`: si applicano qui
//     titolo, descrizione, luogo, inizio, fine e giornata intera. Un evento
//     ANNULLATO o archiviato là viene tolto anche qui (resta comunque nel
//     calendario condiviso, segnato annullato: non si perde niente).
//  2. ANDATA — POST degli appuntamenti, solo di quelli CAMBIATI: l'impronta di
//     ciò che è già partito sta in `Impostazione['calendario.inviati']`.
//  3. Gli eventi cancellati qui vengono archiviati anche là.
//
// ⚠️ NIENTE RIMBALZI: nel ritorno si saltano gli eventi con `ultimoAttore ===
// 'mail'`, che sono l'eco delle nostre stesse scritture.
//
// Chiave di SCRITTURA da `chiaviApp.ts` (`calendario`: Impostazioni App →
// cassaforte del Hub → env `CALENDARIO_API_KEY`). Senza chiave è tutto spento e
// il calendario di AI Mail funziona come prima.

const CALENDARIO_URL = (process.env.CALENDARIO_URL || 'https://deluxy-calendario.vercel.app').replace(/\/$/, '')
const URL_APP = (process.env.APP_URL || 'https://deluxy-mail.vercel.app').replace(/\/$/, '')

/** Nome con cui AI Mail si presenta al calendario (campo `sistema`). */
const SISTEMA = 'mail'

const CHIAVE_STATO = 'calendario.inviati'
const CHIAVE_CURSORE = 'calendario.cursore'

/** Da quanti giorni indietro si continuano a mandare gli appuntamenti passati. */
const GIORNI_INDIETRO = 30

/** Quanti eventi al massimo per giro. */
const LIMITE_DEFAULT = 300

/** Quante pagine di modifiche al massimo per giro (il resto al giro dopo). */
const PAGINE_MAX = 5

export type EsitoCalendario = {
  attivo: boolean
  inviati: number
  invariati: number
  ricevuti: number
  archiviati: number
  errori: number
  messaggio?: string
}

async function chiaveCalendario(): Promise<string> {
  try {
    return (await leggiChiaviApp()).calendario
  } catch {
    return ''
  }
}

/** Per la UI/diagnostica: il calendario condiviso è collegato? */
export async function registroCalendarioAttivo(): Promise<boolean> {
  return (await chiaveCalendario()).length > 0
}

type EventoDaMandare = {
  id: string
  titolo: string
  descrizione: string
  luogo: string
  inizio: Date
  fine: Date | null
  giornataIntera: boolean
  messaggioId: string | null
  creatoDaAI: boolean
  aggiornatoIl: Date
  utente: { email: string; nome: string }
  messaggio: { oggetto: string } | null
}

/** Ciò che al calendario condiviso interessa: se cambia, l'evento va rimandato. */
function impronta(e: EventoDaMandare): string {
  return [
    e.titolo,
    e.descrizione,
    e.luogo,
    e.inizio.toISOString(),
    e.fine?.toISOString() ?? '',
    e.giornataIntera ? '1' : '0',
    e.utente.email,
  ].join('|')
}

function corpoEvento(e: EventoDaMandare) {
  return {
    sistema: SISTEMA,
    idEsterno: e.id,
    utenteEmail: e.utente.email,
    utenteNome: e.utente.nome,
    titolo: e.titolo,
    descrizione: e.descrizione || null,
    inizio: e.inizio.toISOString(),
    fine: e.fine?.toISOString() ?? null,
    giornataIntera: e.giornataIntera,
    // Gli eventi di AI Mail nascono da una mail: sono appuntamenti, non
    // scadenze né consegne (quelle le mandano le app che le generano).
    tipo: 'appuntamento',
    stato: 'programmato',
    luogo: e.luogo || null,
    // Deep link: dall'evento si torna alla mail da cui è nato.
    link: e.messaggioId ? `${URL_APP}/messaggio/${e.messaggioId}` : `${URL_APP}/calendario`,
    contestoTipo: e.messaggioId ? 'messaggio' : null,
    contestoId: e.messaggioId,
    contestoEtichetta: e.messaggio?.oggetto ?? null,
    tag: e.creatoDaAI ? ['mail', 'ai'] : ['mail'],
    asOf: e.aggiornatoIl.toISOString(),
  }
}

// ---------- lo stato della sincronizzazione ----------

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
    .catch(() => {})
}

// ---------- 1. RITORNO: cosa è cambiato nel calendario condiviso ----------

type EventoDalRegistro = {
  id: string
  sistema: string
  idEsterno: string | null
  titolo: string
  descrizione: string | null
  inizio: string
  fine: string | null
  giornataIntera: boolean
  stato: string
  luogo: string | null
  attiva: boolean
  ultimoAttore: string | null
  revisione: number
}

async function tiraDalRegistro(chiave: string): Promise<{ ricevuti: number; errori: number }> {
  let cursore = await leggiCursore()
  let ricevuti = 0
  let errori = 0

  for (let pagina = 0; pagina < PAGINE_MAX; pagina++) {
    let lotto: { cursore: number; altre: boolean; dati: EventoDalRegistro[] } | null = null
    try {
      const res = await fetch(
        `${CALENDARIO_URL}/api/v1/eventi/changes?since=${cursore}&sistema=${SISTEMA}&perPage=200`,
        {
          headers: { 'x-api-key': chiave },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        }
      )
      if (!res.ok) {
        errori++
        break
      }
      lotto = (await res.json()) as { cursore: number; altre: boolean; dati: EventoDalRegistro[] }
    } catch {
      errori++
      break
    }

    let inciampo = false
    for (const ev of lotto.dati ?? []) {
      if (ev.ultimoAttore === SISTEMA) continue // eco delle nostre scritture
      if (!ev.idEsterno) continue
      try {
        if (await applicaEvento(ev)) ricevuti++
      } catch {
        errori++
        inciampo = true
      }
    }

    // ⚠️ Il cursore avanza solo su un lotto andato TUTTO bene. Prima avanzava
    // comunque: un evento che aveva lanciato (Calendario lo aveva spostato,
    // noi non siamo riusciti a scriverlo) veniva **scavalcato per sempre**, e
    // qui restava all’ora vecchia senza che nessuno lo sapesse. Fermandosi,
    // il giro successivo ricomincia da quel punto e ritenta.
    if (inciampo) break
    cursore = lotto.cursore ?? cursore
    if (!lotto.altre) break
  }

  await salvaCursore(cursore)
  return { ricevuti, errori }
}

/** Riporta su un nostro appuntamento ciò che è cambiato nel calendario condiviso. */
async function applicaEvento(ev: EventoDalRegistro): Promise<boolean> {
  const e = await db.evento.findUnique({
    where: { id: ev.idEsterno as string },
    select: {
      id: true,
      titolo: true,
      descrizione: true,
      luogo: true,
      inizio: true,
      fine: true,
      giornataIntera: true,
    },
  })
  if (!e) return false

  // ⚠️ Annullato o archiviato LÀ = tolto anche QUI. È l'unico punto in cui la
  // sincronizzazione cancella qualcosa, ed è una scelta esplicita fatta
  // dall'utente nell'app gemella: l'evento resta comunque nel calendario
  // condiviso (segnato annullato), quindi non si perde niente.
  if (!ev.attiva || ev.stato === 'annullato') {
    await db.evento.delete({ where: { id: e.id } })
    return true
  }

  const inizio = new Date(ev.inizio)
  const fine = ev.fine ? new Date(ev.fine) : null
  const dati: {
    titolo?: string
    descrizione?: string
    luogo?: string
    inizio?: Date
    fine?: Date | null
    giornataIntera?: boolean
  } = {}

  if (ev.titolo && ev.titolo !== e.titolo) dati.titolo = ev.titolo
  if ((ev.descrizione ?? '') !== e.descrizione) dati.descrizione = ev.descrizione ?? ''
  if ((ev.luogo ?? '') !== e.luogo) dati.luogo = ev.luogo ?? ''
  if (!Number.isNaN(inizio.getTime()) && inizio.getTime() !== e.inizio.getTime()) dati.inizio = inizio
  if ((fine?.getTime() ?? null) !== (e.fine?.getTime() ?? null)) dati.fine = fine
  if (ev.giornataIntera !== e.giornataIntera) dati.giornataIntera = ev.giornataIntera

  if (Object.keys(dati).length === 0) return false
  await db.evento.update({ where: { id: e.id }, data: dati })
  return true
}

// ---------- 2. ANDATA: i nostri appuntamenti al calendario condiviso ----------

async function archiviaNelRegistro(chiave: string, idEsterno: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${CALENDARIO_URL}/api/v1/eventi/by-ref/${SISTEMA}/${encodeURIComponent(idEsterno)}`,
      { headers: { 'x-api-key': chiave }, cache: 'no-store', signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return false
    const evento = (await res.json()) as { id?: string }
    if (!evento?.id) return false
    const via = await fetch(`${CALENDARIO_URL}/api/v1/eventi/${evento.id}`, {
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

const CAMPI_EVENTO = {
  id: true,
  titolo: true,
  descrizione: true,
  luogo: true,
  inizio: true,
  fine: true,
  giornataIntera: true,
  messaggioId: true,
  creatoDaAI: true,
  aggiornatoIl: true,
  utente: { select: { email: true, nome: true } },
  messaggio: { select: { oggetto: true } },
} as const

/**
 * Allinea SUBITO un solo appuntamento: creandolo o spostandolo qui, nel
 * calendario condiviso dev'esserci subito — non al giro del cron. Best-effort e
 * con attesa cortissima: sta sul percorso di un clic dell'utente.
 */
export async function allineaEventoOra(id: string, sparito = false): Promise<void> {
  const chiave = await chiaveCalendario()
  if (!chiave) return
  const impronte = await leggiImpronte().catch(() => ({}) as Record<string, string>)

  if (sparito) {
    // ⚠️⚠️ L'impronta si toglie SOLO se l'archiviazione è andata. Prima
    // l'esito veniva scartato e il `delete` girava comunque: se Calendario
    // non rispondeva (503, timeout), quell’id non era più fra le impronte,
    // quindi il giro del cron non lo vedeva più come orfano e non ci
    // riprovava MAI. Risultato: un appuntamento cancellato qui che resta
    // per sempre nel calendario condiviso di tutti.
    // Tenendo l’impronta, il cron lo ritrova fra gli orfani e ritenta.
    if (await archiviaNelRegistro(chiave, id)) {
      delete impronte[id]
      await salvaImpronte(impronte).catch(() => {})
    }
    return
  }

  const e = (await db.evento.findUnique({ where: { id }, select: CAMPI_EVENTO })) as EventoDaMandare | null
  if (!e) return
  try {
    const res = await fetch(`${CALENDARIO_URL}/api/v1/eventi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chiave },
      body: JSON.stringify(corpoEvento(e)),
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return
    impronte[e.id] = impronta(e)
    await salvaImpronte(impronte).catch(() => {})
  } catch {
    /* calendario lento o giù: ci pensa il giro del cron */
  }
}

/**
 * Sincronizza gli appuntamenti col calendario condiviso, nei due sensi. Non
 * lancia mai: se il calendario non risponde, la posta continua a funzionare.
 */
export async function sincronizzaEventiConRegistro(
  opzioni: { limite?: number; forza?: boolean } = {},
): Promise<EsitoCalendario> {
  const chiave = await chiaveCalendario()
  if (!chiave) {
    return {
      attivo: false,
      inviati: 0,
      invariati: 0,
      ricevuti: 0,
      archiviati: 0,
      errori: 0,
      messaggio: 'Chiave del Calendario condiviso non configurata (Impostazioni App → Calendario).',
    }
  }

  const daLoro = await tiraDalRegistro(chiave)

  const limite = Math.min(Math.max(opzioni.limite ?? LIMITE_DEFAULT, 1), 1000)
  const dal = new Date(Date.now() - GIORNI_INDIETRO * 24 * 60 * 60 * 1000)

  const eventi = (await db.evento.findMany({
    where: { inizio: { gte: dal } },
    select: CAMPI_EVENTO,
    orderBy: { inizio: 'asc' },
    take: limite,
  })) as EventoDaMandare[]

  const impronte = await leggiImpronte()
  const visti = new Set<string>()
  let inviati = 0
  let invariati = 0
  let archiviati = 0
  let errori = daLoro.errori

  for (const e of eventi) {
    visti.add(e.id)
    const attuale = impronta(e)
    if (!opzioni.forza && impronte[e.id] === attuale) {
      invariati++
      continue
    }
    try {
      const res = await fetch(`${CALENDARIO_URL}/api/v1/eventi`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': chiave },
        body: JSON.stringify(corpoEvento(e)),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        errori++
        continue
      }
      impronte[e.id] = attuale
      inviati++
    } catch {
      errori++
    }
  }

  // Come per le attività: si distingue l'evento CANCELLATO (va archiviato anche
  // là) da quello semplicemente uscito dalla finestra dei 30 giorni.
  const orfani = Object.keys(impronte).filter((id) => !visti.has(id))
  if (orfani.length > 0) {
    let esistenti = new Set<string>()
    try {
      const righe = await db.evento.findMany({ where: { id: { in: orfani } }, select: { id: true } })
      esistenti = new Set(righe.map((r) => r.id))
    } catch {
      esistenti = new Set(orfani) // nel dubbio non si archivia niente
    }
    for (const id of orfani) {
      if (esistenti.has(id)) {
        // C'è ancora, è solo uscito dalla finestra dei giorni guardati:
        // l'impronta non serve più e si toglie senza archiviare niente.
        delete impronte[id]
        continue
      }
      // ⚠️ Cancellato davvero: l'impronta se ne va SOLO se l'archiviazione
      // nel registro è riuscita. Prima il `delete` stava fuori dall’`if`, e
      // un guasto di Calendario bruciava la traccia: l’evento restava nel
      // calendario condiviso e non c’era più niente per cui ritentare.
      // ⚠️ Vale anche quando la lettura qui sopra è fallita: in quel caso
      // `esistenti` contiene tutti gli orfani, quindi non si archivia e non
      // si cancella nulla — che è il comportamento prudente voluto.
      if (await archiviaNelRegistro(chiave, id)) {
        archiviati++
        delete impronte[id]
      }
    }
  }

  try {
    await salvaImpronte(impronte)
  } catch {
    /* si rimanda al giro dopo */
  }

  return { attivo: true, inviati, invariati, ricevuti: daLoro.ricevuti, archiviati, errori }
}
