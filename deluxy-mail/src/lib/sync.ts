import { db } from './db'
import { scaricaNuovi } from './imap'
import { applicaRegole } from './regole'
import { analizzaMessaggio } from './ai'
import { CHIAVI, leggiImpostazioni } from './impostazioni'

export type EsitoSync = {
  account: string
  scaricati: number
  analizzati: number
  attivitaCreate: number
  bozzeCreate: number
  errore?: string
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

    try {
      const analisi = await analizzaMessaggio({
        messaggio: msg,
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
        where: { id: salvato.id },
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
      esito.analizzati++

      const attivita = daRegole.creaAttivita && analisi.attivita.length === 0
        ? [{ titolo: `Gestire: ${msg.oggetto}`, dettaglio: analisi.riassunto, scadenza: null, priorita: analisi.priorita }]
        : analisi.attivita

      for (const a of attivita) {
        await db.attivita.create({
          data: {
            messaggioId: salvato.id,
            titolo: a.titolo,
            dettaglio: a.dettaglio || null,
            scadenza: a.scadenza ? new Date(a.scadenza) : null,
            priorita: ['alta', 'media', 'bassa'].includes(a.priorita) ? a.priorita : 'media',
          },
        })
        esito.attivitaCreate++
      }

      const vuoleBozza = daRegole.creaBozza || analisi.serveRisposta
      if (vuoleBozza && analisi.bozza) {
        await db.bozza.create({
          data: {
            messaggioId: salvato.id,
            oggetto: analisi.bozza.oggetto,
            corpo: analisi.bozza.corpo,
            corpoAI: analisi.bozza.corpo,
          },
        })
        esito.bozzeCreate++
      }
    } catch (e) {
      await db.messaggio.update({
        where: { id: salvato.id },
        data: { erroreAI: e instanceof Error ? e.message : String(e) },
      })
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
  return esiti
}
