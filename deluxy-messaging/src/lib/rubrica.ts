// Riconoscere chi ci scrive, usando la NOSTRA rubrica Google.
//
// Su WhatsApp arriva il numero e il nome che il cliente si è messo sul profilo:
// «Nicolo», «Ale», a volte un'emoji, spesso niente. In rubrica invece quel
// numero è già salvato come lo abbiamo salvato noi — «FL Mario Rossi #1042» —
// e quella riga dice in un colpo chi è e con quale ordine.
//
// La rubrica è la stessa che l'app riempie dagli ordini (deluxy.delivery@gmail.com,
// collegata in Impostazioni): qui la si legge, e la si legge SOLO per dare un
// nome a una conversazione. Nessun contatto viene creato o modificato da qui.
//
// ⚠️ Non si cerca dentro il webhook. Una ricerca sulla People API sono due o tre
// chiamate HTTP: messe nel percorso che riceve i messaggi, allungano la risposta
// a Meta e — se Google è lento — fanno andare il webhook in timeout, cioè
// fanno PERDERE messaggi. Qui si guarda dopo: dal cron ogni ora, o su richiesta
// di chi sta guardando quella conversazione.

import { db } from './db'
import { googleAccessToken } from './contatti'
import { cercaContattoPerTelefono } from './google'

/** Il numero come lo scrive Meta (senza +) diventa un numero cercabile. */
function numeroCercabile(idEsterno: string): string {
  const cifre = idEsterno.replace(/[^\d]/g, '')
  return cifre ? `+${cifre}` : ''
}

export type EsitoRiconoscimento = {
  trovato: boolean
  nome: string
  /** Perché non si è potuto cercare, quando è il caso. */
  motivo?: string
}

/**
 * Guarda in rubrica il numero di UNA conversazione e, se lo trova, ne salva il
 * nome. Torna anche l'esito negativo: «non è in rubrica» è una risposta utile,
 * e va scritta per non richiederla ogni ora.
 */
export async function riconosciConversazione(id: string): Promise<EsitoRiconoscimento> {
  const c = await db.conversazione.findUnique({
    where: { id },
    select: { id: true, canale: true, idEsterno: true },
  })
  if (!c) return { trovato: false, nome: '', motivo: 'Conversazione non trovata.' }
  // Solo WhatsApp: è l'unico canale in cui il cliente arriva con un numero di
  // telefono. Su Instagram e Messenger l'id non è un numero e in rubrica non
  // c'è niente da cercare.
  if (c.canale !== 'whatsapp') {
    return { trovato: false, nome: '', motivo: 'La rubrica riconosce solo i numeri di telefono.' }
  }
  const numero = numeroCercabile(c.idEsterno)
  if (!numero) return { trovato: false, nome: '', motivo: 'Numero non riconoscibile.' }

  const token = await googleAccessToken()
  if (!token) {
    return { trovato: false, nome: '', motivo: 'Google non è collegato (Impostazioni).' }
  }

  const contatto = await cercaContattoPerTelefono(token, numero)
  await db.conversazione.update({
    where: { id },
    data: { nomeRubrica: contatto?.nome ?? '', rubricaCercataIl: new Date() },
  })
  return { trovato: Boolean(contatto), nome: contatto?.nome ?? '' }
}

export type RiepilogoRubrica = {
  guardate: number
  riconosciute: number
  motivo?: string
}

/**
 * Il giro automatico: dà un nome alle conversazioni WhatsApp che non l'hanno
 * ancora avuto. Tetto basso di proposito — la People API si paga in tempo, e
 * un cron che sfora non finisce mai il lavoro.
 */
export async function riconosciDaRubrica(limite = 25): Promise<RiepilogoRubrica> {
  const token = await googleAccessToken()
  if (!token) return { guardate: 0, riconosciute: 0, motivo: 'Google non collegato.' }

  const daGuardare = await db.conversazione.findMany({
    where: { canale: 'whatsapp', rubricaCercataIl: null },
    orderBy: { ultimoMessaggioIl: 'desc' }, // prima le conversazioni vive
    take: limite,
    select: { id: true, idEsterno: true },
  })

  let riconosciute = 0
  for (const c of daGuardare) {
    const numero = numeroCercabile(c.idEsterno)
    let nome = ''
    if (numero) {
      try {
        nome = (await cercaContattoPerTelefono(token, numero))?.nome ?? ''
      } catch {
        // Google che non risponde non deve fermare il giro: si riprova domani
        // (la data non si scrive, quindi questa resta da guardare).
        continue
      }
    }
    await db.conversazione.update({
      where: { id: c.id },
      data: { nomeRubrica: nome, rubricaCercataIl: new Date() },
    })
    if (nome) riconosciute++
  }
  return { guardate: daGuardare.length, riconosciute }
}
