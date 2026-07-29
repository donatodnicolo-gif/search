import { db } from './db'
import { estraiDatiAzione } from './ai'
import { azioneDi, chiaveDiAzione, dominioDi } from './appDeluxy'
import { leggiChiaviApp } from './chiaviApp'
import { CHIAVI, leggiImpostazioni } from './impostazioni'

/**
 * L'AZIONE DI UNA SEZIONE.
 *
 * Una sezione può avere agganciata un'azione APP DELUXY (il catalogo sta in
 * `appDeluxy.ts`): spostandoci dentro una mail **a mano**, o si apre la
 * proposta coi dati da controllare (`chiedi`) o la chiamata parte da sola
 * (`automatico`).
 *
 * ⚠️ Il gancio è sullo spostamento MANUALE, non sulla sezione in sé: la
 * sezione la scrivono anche l'AI e le regole, e un errore di smistamento
 * creerebbe schede vere dentro un registro aziendale. Chi chiama deve quindi
 * passare di qui solo dopo un gesto dell'utente.
 */

export type ModoAzione = 'chiedi' | 'automatico'

/** L'azione agganciata a una sezione, già pronta da mostrare o da eseguire. */
export type AzioneDiSezione = {
  azioneId: string
  app: string
  nome: string
  modo: ModoAzione
  istruzioni: string
}

export function modoValido(v: string | null | undefined): ModoAzione {
  return v === 'automatico' ? 'automatico' : 'chiedi'
}

/**
 * L'azione di una sezione, o null se non ne ha (o se l'azione salvata non
 * esiste più nel catalogo). Lettura DIFENSIVA: prima della migrazione le tre
 * colonne non ci sono e la posta deve funzionare lo stesso.
 */
export async function azioneDiSezione(
  utenteId: string,
  sezioneId: string | null
): Promise<AzioneDiSezione | null> {
  if (!sezioneId) return null
  try {
    const s = await db.sezione.findFirst({
      where: { id: sezioneId, utenteId },
      select: { azioneId: true, azioneModo: true, azioneIstruzioni: true },
    })
    if (!s?.azioneId) return null
    const azione = azioneDi(s.azioneId)
    if (!azione) return null
    return {
      azioneId: azione.id,
      app: azione.app,
      nome: azione.nome,
      modo: modoValido(s.azioneModo),
      istruzioni: s.azioneIstruzioni ?? '',
    }
  } catch {
    return null
  }
}

/**
 * I domini delle NOSTRE caselle. Servono in due punti: a dire al modello quale
 * lato dello scambio siamo noi, e a impedire (nel codice) che si crei
 * l'anagrafica di noi stessi.
 */
export async function nostriDomini(utenteId: string): Promise<string[]> {
  try {
    const account = await db.account.findMany({ where: { utenteId }, select: { email: true } })
    return [...new Set(account.map((a) => dominioDi(a.email)).filter(Boolean))]
  } catch {
    return []
  }
}

/**
 * L'indirizzo dell'ALTRA azienda nello scambio: il primo fra mittente e
 * destinatari che non è su un nostro dominio. Su una mail che abbiamo mandato
 * noi il mittente siamo noi, e la controparte sta fra i destinatari — ecco
 * perché non basta guardare il mittente.
 */
export function controparteDi(
  m: { mittente: string; destinatari: string },
  nostri: string[]
): string | null {
  const indirizzi = `${m.mittente}, ${m.destinatari}`.match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []
  for (const a of indirizzi) {
    const d = dominioDi(a)
    if (d && !nostri.includes(d)) return a.toLowerCase()
  }
  return null
}

export type EsitoAzioneSezione = {
  ok: boolean
  messaggio: string
  /** true quando non c'era niente da fare (già inviata): non è un errore. */
  saltata?: boolean
}

/**
 * Esegue davvero l'azione di una sezione su una mail: l'AI estrae i dati dalla
 * mail e si chiama l'app. Nessuna conferma — è la modalità `automatico`, e chi
 * la chiama deve farlo dentro `after()`, dopo che la risposta è partita.
 *
 * Ogni esito (riuscito o no) finisce in `InvioApp`, che è ciò che si vede sotto
 * la mail in «Risposte dalle app»: un lavoro in sottofondo muto non è
 * diagnosticabile, e questo esce di casa verso un'altra app.
 */
export async function eseguiAzioneSezioneOra(opts: {
  utenteId: string
  utenteEmail: string
  messaggioId: string
  azione: AzioneDiSezione
}): Promise<EsitoAzioneSezione> {
  const { utenteId, utenteEmail, messaggioId, azione: scelta } = opts
  const azione = azioneDi(scelta.azioneId)
  if (!azione) return { ok: false, messaggio: 'Azione sconosciuta.' }

  // Idempotenza: se questa mail ha già mandato QUESTA azione con successo non
  // si rifà. Senza, bastava rimettere la mail nella sezione per richiamare
  // l'app una seconda volta.
  try {
    const gia = await db.invioApp.findFirst({
      where: { utenteId, messaggioId, azioneId: azione.id, esito: 'ok' },
      select: { id: true },
    })
    if (gia) return { ok: true, saltata: true, messaggio: 'Già inviata a questa app.' }
  } catch {
    /* storico non leggibile: si prosegue, l'app di destinazione fa upsert */
  }

  const m = await db.messaggio.findFirst({
    where: { id: messaggioId, utenteId },
    select: {
      id: true,
      mittente: true,
      mittenteNome: true,
      destinatari: true,
      oggetto: true,
      data: true,
      corpoTesto: true,
    },
  })
  if (!m) return { ok: false, messaggio: 'Messaggio non trovato.' }

  const chiavi = await leggiChiaviApp()
  const chiave = chiaveDiAzione(azione, chiavi)
  if (!chiave) {
    return await registra(utenteId, m.id, azione.id, {
      ok: false,
      messaggio: `${azione.app} non è collegata: manca la chiave in Impostazioni App.`,
    })
  }

  const nostri = await nostriDomini(utenteId)
  const controparte = controparteDi(m, nostri)

  let dati: Record<string, unknown>
  try {
    const imp = await leggiImpostazioni()
    dati = await estraiDatiAzione({
      messaggio: m,
      controparte,
      nostriDomini: nostri,
      nomeAzione: `${azione.app} — ${azione.nome}`,
      guida: azione.guida,
      schema: azione.schema,
      istruzioni: scelta.istruzioni.trim() ? [scelta.istruzioni.trim()] : [],
      contestoAzienda: imp[CHIAVI.contestoAzienda],
    })
  } catch (e) {
    const t = e instanceof Error ? e.message : 'Non riuscita.'
    return await registra(utenteId, m.id, azione.id, {
      ok: false,
      messaggio: `L'AI non è riuscita a preparare i dati: ${t.slice(0, 120)}`,
    })
  }

  const ctx = { utenteEmail, chiave, nostriDomini: nostri, controparte }

  // Prima la correzione (quel che il codice SA vince su quel che il modello ha
  // scritto), poi il controllo: se dice di no non si manda niente — ma lo si
  // scrive, col motivo e coi dati preparati. Un invio non fatto e non
  // raccontato è indistinguibile da uno fallito.
  const finali = azione.normalizza?.(dati, ctx) ?? dati
  const motivo = azione.verifica?.(finali, ctx) ?? null
  if (motivo) {
    return await registra(
      utenteId,
      m.id,
      azione.id,
      { ok: false, messaggio: motivo },
      JSON.stringify(finali, null, 2),
      'saltato'
    )
  }

  const esito = await azione.esegui(finali, ctx)
  return await registra(utenteId, m.id, azione.id, esito, JSON.stringify(finali, null, 2))
}

async function registra(
  utenteId: string,
  messaggioId: string,
  azioneId: string,
  esito: { ok: boolean; messaggio: string; link?: string },
  datiJson = '',
  /** 'saltato' quando la verifica ha detto di no: non è un errore dell'app. */
  come?: 'saltato'
): Promise<EsitoAzioneSezione> {
  try {
    await db.invioApp.create({
      data: {
        utenteId,
        messaggioId,
        azioneId,
        esito: come ?? (esito.ok ? 'ok' : 'errore'),
        // Si vede sotto la mail: dire che è stata l'azione automatica cambia
        // come si legge («l'ho mandata io?» è la prima domanda).
        esitoTesto: `${esito.messaggio} (automatica: mail messa nella sezione)`,
        dati: datiJson.slice(0, 8000),
        link: esito.link ?? null,
      },
    })
  } catch {
    /* lo storico non deve cambiare l'esito */
  }
  return { ok: esito.ok, messaggio: esito.messaggio }
}
