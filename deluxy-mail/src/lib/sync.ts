import type { Sezione } from '@prisma/client'
import { db } from './db'
import { scaricaNuovi, testoLeggibile, type MessaggioScaricato } from './imap'
import { applicaRegole, type EsitoRegole } from './regole'
import { analizzaMessaggio } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'

export type EsitoSync = {
  // 'scarico' = messaggi nuovi presi dalla casella;
  // 'rianalisi' = messaggi già presenti, rimasti senza analisi e riprovati.
  tipo: 'scarico' | 'rianalisi'
  account: string
  scaricati: number
  analizzati: number
  attivitaCreate: number
  bozzeCreate: number
  errore?: string
}

/**
 * Chiede l'analisi all'AI e la salva sul messaggio già presente a database.
 *
 * Sta fuori dal ciclo di scarico perché serve in due momenti: quando un
 * messaggio arriva, e quando si riprova un messaggio la cui analisi era
 * fallita (tipicamente per un errore temporaneo dell'API).
 */
async function analizzaESalva(opts: {
  messaggioId: string
  messaggio: MessaggioScaricato
  daRegole: EsitoRegole
  sezioni: Sezione[]
  impostazioni: Record<string, string>
}): Promise<{ ok: boolean; attivitaCreate: number; bozzeCreate: number }> {
  const { messaggioId, messaggio, daRegole, sezioni, impostazioni } = opts

  try {
    const analisi = await analizzaMessaggio({
      messaggio,
      sezioni,
      istruzioniAI: daRegole.istruzioniAI,
      contestoAzienda: impostazioni[CHIAVI.contestoAzienda],
      firma: impostazioni[CHIAVI.firma],
      oggi: new Date(),
    })

    // Una regola deterministica ha l'ultima parola sulla sezione: se l'hai
    // scritta tu, l'AI non la sovrascrive.
    const sezioneAI = analisi.sezione
      ? (sezioni.find((s) => s.nome === analisi.sezione)?.id ?? null)
      : null
    const sezioneId = daRegole.sezioneId ?? sezioneAI

    await db.messaggio.update({
      where: { id: messaggioId },
      data: {
        sezioneId,
        smistatoDa: daRegole.sezioneId ? 'regola' : sezioneAI ? 'ai' : null,
        priorita: analisi.priorita,
        riassunto: analisi.riassunto,
        serveRisposta: analisi.serveRisposta,
        analizzatoIl: new Date(),
        erroreAI: null,
      },
    })

    const attivita =
      daRegole.creaAttivita && analisi.attivita.length === 0
        ? [
            {
              titolo: `Gestire: ${messaggio.oggetto}`,
              dettaglio: analisi.riassunto,
              scadenza: null,
              priorita: analisi.priorita,
            },
          ]
        : analisi.attivita

    // Su una ri-analisi il messaggio può avere già attività e bozza di un
    // tentativo precedente: si ripulisce, altrimenti si duplicano.
    await db.attivita.deleteMany({ where: { messaggioId, creataDaAI: true } })
    await db.bozza.deleteMany({ where: { messaggioId, inviata: false } })

    for (const a of attivita) {
      await db.attivita.create({
        data: {
          messaggioId,
          titolo: a.titolo,
          dettaglio: a.dettaglio || null,
          scadenza: a.scadenza ? new Date(a.scadenza) : null,
          priorita: ['alta', 'media', 'bassa'].includes(a.priorita) ? a.priorita : 'media',
        },
      })
    }

    const vuoleBozza = daRegole.creaBozza || analisi.serveRisposta
    let bozzeCreate = 0
    if (vuoleBozza && analisi.bozza) {
      await db.bozza.create({
        data: {
          messaggioId,
          oggetto: analisi.bozza.oggetto,
          corpo: analisi.bozza.corpo,
          corpoAI: analisi.bozza.corpo,
        },
      })
      bozzeCreate = 1
    }

    return { ok: true, attivitaCreate: attivita.length, bozzeCreate }
  } catch (e) {
    await db.messaggio.update({
      where: { id: messaggioId },
      data: { erroreAI: e instanceof Error ? e.message : String(e) },
    })
    return { ok: false, attivitaCreate: 0, bozzeCreate: 0 }
  }
}

/**
 * Riprova i messaggi già scaricati ma mai analizzati: senza questo, una mail
 * arrivata mentre l'API era ferma (quota finita, rete giù) resterebbe grezza
 * per sempre, perché lo scarico non la ripesca più.
 */
export async function rianalizzaFalliti(limite = 25): Promise<EsitoSync> {
  const esito: EsitoSync = {
    tipo: 'rianalisi',
    account: 'messaggi rimasti indietro',
    scaricati: 0,
    analizzati: 0,
    attivitaCreate: 0,
    bozzeCreate: 0,
  }

  const [sezioni, regole, impostazioni] = await Promise.all([
    db.sezione.findMany({ orderBy: { ordine: 'asc' } }),
    db.regola.findMany(),
    leggiImpostazioni(),
  ])

  const falliti = await db.messaggio.findMany({
    where: { analizzatoIl: null },
    orderBy: { data: 'desc' },
    take: limite,
  })

  for (const m of falliti) {
    // Un messaggio salvato prima che la ripulitura del testo esistesse ha il
    // corpo ancora pieno di CSS: si ripulisce ora, e se cambia lo si riscrive
    // a database, così anteprima e dettaglio smettono di mostrare markup.
    const corpoTesto = testoLeggibile(m.corpoTesto, m.corpoHtml ?? undefined)
    if (corpoTesto !== m.corpoTesto) {
      await db.messaggio.update({
        where: { id: m.id },
        data: { corpoTesto, anteprima: corpoTesto.replace(/\s+/g, ' ').slice(0, 200) },
      })
    }

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
      corpoTesto,
      corpoHtml: m.corpoHtml,
      allegati: m.allegati,
      letto: m.letto,
    }
    const daRegole = applicaRegole(regole, messaggio)
    const analisi = await analizzaESalva({
      messaggioId: m.id,
      messaggio,
      daRegole,
      sezioni,
      impostazioni,
    })
    esito.scaricati++
    if (analisi.ok) {
      esito.analizzati++
      esito.attivitaCreate += analisi.attivitaCreate
      esito.bozzeCreate += analisi.bozzeCreate
    }
  }

  return esito
}

/**
 * Sincronizza una casella: scarica i nuovi messaggi, applica le regole
 * dell'utente e poi chiede all'AI sezione, attività e bozza di risposta.
 *
 * L'analisi AI di un messaggio che fallisce non blocca gli altri: l'errore
 * viene scritto sul messaggio e il ciclo prosegue.
 */
export async function sincronizzaAccount(accountId: string, limite = 25): Promise<EsitoSync> {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } })
  const esito: EsitoSync = {
    tipo: 'scarico',
    account: account.email,
    scaricati: 0,
    analizzati: 0,
    attivitaCreate: 0,
    bozzeCreate: 0,
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

  const [sezioni, regole, impostazioni] = await Promise.all([
    db.sezione.findMany({ orderBy: { ordine: 'asc' } }),
    db.regola.findMany(),
    leggiImpostazioni(),
  ])

  for (const msg of nuovi.messaggi) {
    // Un UID già presente significa che l'abbiamo già lavorato: si salta.
    const esistente = await db.messaggio.findUnique({
      where: { accountId_uid: { accountId: account.id, uid: msg.uid } },
    })
    if (esistente) continue

    const daRegole = applicaRegole(regole, msg)

    const salvato = await db.messaggio.create({
      data: {
        accountId: account.id,
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

    const analisi = await analizzaESalva({
      messaggioId: salvato.id,
      messaggio: msg,
      daRegole,
      sezioni,
      impostazioni,
    })
    if (analisi.ok) {
      esito.analizzati++
      esito.attivitaCreate += analisi.attivitaCreate
      esito.bozzeCreate += analisi.bozzeCreate
    }
  }

  await db.account.update({
    where: { id: account.id },
    data: { ultimoUid: nuovi.ultimoUid, ultimoSync: new Date(), ultimoErrore: null },
  })

  return esito
}

export async function sincronizzaTutti(): Promise<EsitoSync[]> {
  const account = await db.account.findMany({ where: { attivo: true } })
  const esiti: EsitoSync[] = []
  for (const a of account) esiti.push(await sincronizzaAccount(a.id))

  // Ogni giro recupera anche quello che era rimasto indietro: se l'API era
  // ferma ieri, oggi quei messaggi vengono analizzati senza doverlo chiedere.
  const recuperati = await rianalizzaFalliti()
  if (recuperati.scaricati > 0) esiti.push(recuperati)

  return esiti
}
