// I messaggi che riguardano un ordine.
//
// Chi guarda un ordine ha bisogno di sapere se quel cliente ci ha già scritto —
// e cosa ha detto. Senza, si risponde due volte alla stessa domanda, o si
// chiama qualcuno che aveva già spiegato tutto per iscritto.
//
// COME SI COLLEGA UN ORDINE A UNA CONVERSAZIONE, in ordine di certezza:
//  1. **Il numero d'ordine** scritto sulla conversazione (`ordineNumero`): ce lo
//     mette lo smistamento delle mail leggendo l'oggetto. È il legame più forte.
//  2. **L'indirizzo email** del cliente: sulle mail `idEsterno` è proprio quello.
//  3. **Il telefono**, per WhatsApp: `idEsterno` è il numero senza il +.
//
// ⚠️ Non si cerca per NOME. Due clienti possono chiamarsi uguale, e mostrare a
// un operatore la conversazione di un'altra persona sotto l'ordine sbagliato è
// peggio che non mostrare niente: si risponde a Tizio parlando dell'ordine di
// Caio, e nessuno se ne accorge finché non è tardi.

import { db } from './db'

/** Il telefono come lo scrive WhatsApp: solo cifre, senza + né spazi. */
export function telefonoConfrontabile(v: string): string {
  const cifre = (v ?? '').replace(/\D/g, '')
  if (cifre.length < 8) return ''
  // I numeri italiani girano sia come 3498853209 sia come 393498853209: si
  // confronta la coda, che è la parte che non cambia.
  return cifre.slice(-9)
}

export type ConversazioneOrdine = {
  id: string
  canale: string
  chi: string
  ultimoTesto: string
  ultimoMessaggioIl: Date
  nonLetti: number
  /** Come l'abbiamo collegata: serve a sapere quanto fidarsi. */
  legame: 'numero' | 'email' | 'telefono'
}

/** Le conversazioni collegate a UN ordine. */
export async function conversazioniDellOrdine(ordine: {
  numero: string
  email: string
  telefono: string
}): Promise<ConversazioneOrdine[]> {
  const numero = (ordine.numero ?? '').trim()
  const email = (ordine.email ?? '').trim().toLowerCase()
  const coda = telefonoConfrontabile(ordine.telefono ?? '')

  const dove: Record<string, unknown>[] = []
  if (numero) dove.push({ ordineNumero: numero })
  if (email) dove.push({ canale: 'email', idEsterno: email })
  // Il telefono si filtra dopo: in SQL non c'è un «finisce per» sugli indici, e
  // le conversazioni WhatsApp sono poche.
  if (coda) dove.push({ canale: 'whatsapp' })
  if (!dove.length) return []

  const righe = await db.conversazione.findMany({
    where: { eliminataIl: null, OR: dove as never },
    orderBy: { ultimoMessaggioIl: 'desc' },
    take: 40,
    select: {
      id: true,
      canale: true,
      nome: true,
      nomeRubrica: true,
      idEsterno: true,
      ultimoTesto: true,
      ultimoMessaggioIl: true,
      nonLetti: true,
      ordineNumero: true,
    },
  })

  const fuori: ConversazioneOrdine[] = []
  for (const c of righe) {
    let legame: ConversazioneOrdine['legame'] | null = null
    if (numero && c.ordineNumero === numero) legame = 'numero'
    else if (email && c.canale === 'email' && c.idEsterno.toLowerCase() === email) legame = 'email'
    else if (coda && c.canale === 'whatsapp' && telefonoConfrontabile(c.idEsterno) === coda)
      legame = 'telefono'
    if (!legame) continue
    fuori.push({
      id: c.id,
      canale: c.canale,
      chi: c.nomeRubrica || c.nome || c.idEsterno,
      ultimoTesto: c.ultimoTesto,
      ultimoMessaggioIl: c.ultimoMessaggioIl,
      nonLetti: c.nonLetti,
      legame,
    })
  }
  return fuori
}

/**
 * Quali ordini, fra quelli in elenco, hanno messaggi — in due query sole.
 *
 * ⚠️ Non si fa una query per ordine: con 200 ordini a schermo sarebbero 200
 * andate e ritorni al database a ogni caricamento della bacheca, e la pagina si
 * pianta. Si prendono le conversazioni una volta e si incrociano in memoria.
 */
export async function ordiniConMessaggi(
  ordini: { id: string; numero: string; email: string; telefono: string }[]
): Promise<Map<string, { quanti: number; nonLetti: number }>> {
  const numeri = [...new Set(ordini.map((o) => o.numero).filter(Boolean))]
  const email = [...new Set(ordini.map((o) => (o.email ?? '').toLowerCase()).filter(Boolean))]

  const [perNumeroEmail, chat] = await Promise.all([
    numeri.length || email.length
      ? db.conversazione.findMany({
          where: {
            eliminataIl: null,
            OR: [
              ...(numeri.length ? [{ ordineNumero: { in: numeri } }] : []),
              ...(email.length ? [{ canale: 'email', idEsterno: { in: email } }] : []),
            ],
          },
          select: { idEsterno: true, canale: true, ordineNumero: true, nonLetti: true },
        })
      : Promise.resolve([]),
    // Le conversazioni WhatsApp sono poche: si prendono tutte e si confrontano
    // per coda del numero, che in SQL non si può indicizzare.
    db.conversazione.findMany({
      where: { canale: 'whatsapp', eliminataIl: null },
      select: { idEsterno: true, nonLetti: true },
    }),
  ])

  const perCoda = new Map<string, { quanti: number; nonLetti: number }>()
  for (const c of chat) {
    const coda = telefonoConfrontabile(c.idEsterno)
    if (!coda) continue
    const prec = perCoda.get(coda) ?? { quanti: 0, nonLetti: 0 }
    perCoda.set(coda, { quanti: prec.quanti + 1, nonLetti: prec.nonLetti + c.nonLetti })
  }

  const fuori = new Map<string, { quanti: number; nonLetti: number }>()
  for (const o of ordini) {
    let quanti = 0
    let nonLetti = 0
    for (const c of perNumeroEmail) {
      const perNumero = o.numero && c.ordineNumero === o.numero
      const perEmail =
        o.email && c.canale === 'email' && c.idEsterno.toLowerCase() === o.email.toLowerCase()
      if (perNumero || perEmail) {
        quanti++
        nonLetti += c.nonLetti
      }
    }
    const coda = telefonoConfrontabile(o.telefono ?? '')
    const daChat = coda ? perCoda.get(coda) : undefined
    if (daChat) {
      quanti += daChat.quanti
      nonLetti += daChat.nonLetti
    }
    if (quanti) fuori.set(o.id, { quanti, nonLetti })
  }
  return fuori
}
