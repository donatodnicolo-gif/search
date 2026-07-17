import type { Regola, Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, scaricaVecchi, type MessaggioScaricato } from './imap'
import { applicaRegole } from './regole'
import { analizzaMessaggio } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'
import { CODICI_PRIORITA } from './format'

export type EsitoSync = {
  // 'scarico' = messaggi nuovi presi dalla casella;
  // 'storico' = messaggi vecchi recuperati andando indietro.
  tipo: 'scarico' | 'storico'
  account: string
  scaricati: number
  /** Solo per 'storico': true quando non c'è più posta vecchia da prendere. */
  finito?: boolean
  errore?: string
}

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
 * Sincronizza una casella: scarica i nuovi messaggi e applica le regole.
 *
 * Qui l'AI non entra: costa, e la maggior parte della posta non merita
 * un'analisi. La si chiama quando dai una priorità a un messaggio.
 */
export async function sincronizzaAccount(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'scarico', account: account.email, scaricati: 0 }

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
  await salvaMessaggi({ accountId: account.id, messaggi: nuovi.messaggi, regole, esito })

  await db.account.update({
    where: { id: account.id },
    data: {
      ultimoUid: nuovi.ultimoUid,
      // primoUid si fissa al primo scarico: da lì in poi si muove solo
      // all'indietro, quando si chiede lo storico.
      ...(account.primoUid === 0 && nuovi.primoUid > 0 ? { primoUid: nuovi.primoUid } : {}),
      ultimoSync: new Date(),
      ultimoErrore: null,
    },
  })

  return esito
}

/** Salva i messaggi nuovi applicando le regole, saltando quelli già presenti. */
async function salvaMessaggi(opts: {
  accountId: string
  messaggi: MessaggioScaricato[]
  regole: Regola[]
  esito: EsitoSync
}): Promise<void> {
  const { accountId, messaggi, regole, esito } = opts

  for (const msg of messaggi) {
    // Un UID già presente significa che l'abbiamo già lavorato: si salta.
    const esistente = await db.messaggio.findUnique({
      where: { accountId_uid: { accountId, uid: msg.uid } },
    })
    if (esistente) continue

    const daRegole = applicaRegole(regole, msg)

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
    esito.scaricati++
  }
}

/**
 * Scarica un blocco di posta vecchia, andando indietro nel tempo.
 * Come lo scarico normale: prende i messaggi, non li analizza.
 */
export async function scaricaStorico(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = { tipo: 'storico', account: account.email, scaricati: 0 }

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
  await salvaMessaggi({ accountId: account.id, messaggi: vecchi.messaggi, regole, esito })

  await db.account.update({
    where: { id: account.id },
    data: { primoUid: vecchi.primoUid, storicoFinito: vecchi.finito },
  })

  return { ...esito, finito: vecchi.finito }
}

export async function sincronizzaTutti(): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) esiti.push(await sincronizzaAccount(a.id))
  return esiti
}
