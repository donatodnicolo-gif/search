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

  const precise: Record<string, unknown>[] = []
  if (numero) precise.push({ ordineNumero: numero })
  if (email) precise.push({ canale: 'email', idEsterno: email })
  if (!precise.length && !coda) return []

  const campi = {
    id: true,
    canale: true,
    nome: true,
    nomeRubrica: true,
    idEsterno: true,
    ultimoTesto: true,
    ultimoMessaggioIl: true,
    nonLetti: true,
    ordineNumero: true,
  } as const

  // ⚠️⚠️ DUE QUERY, NON UNA CON L'«OR» LARGO.
  //
  // Prima erano una sola: `OR: [numero, email, {canale:'whatsapp'}]` con
  // `take: 40`. Ma `{canale:'whatsapp'}` **non filtra niente** — il telefono in
  // SQL non si può confrontare per coda, quindi quel ramo pesca TUTTE le chat
  // WhatsApp e le fa competere per i 40 posti insieme a quelle vere. Con 132
  // conversazioni pescate, quella del cliente stava alla **posizione 87**: il
  // riquadro dei messaggi diceva «nessun messaggio» mentre la chat esisteva.
  //
  // ⚠️ Il difetto era invisibile da tutte e due le parti: la bacheca contava 1
  // messaggio (lei usa due query separate e le conta tutte) e il dettaglio ne
  // mostrava 0, senza che nessuna delle due desse errore. Trovato solo
  // confrontandole una contro l'altra — `scripts/prova-messaggi-ordine.mts`.
  const [daPrecise, daChat] = await Promise.all([
    precise.length
      ? db.conversazione.findMany({
          where: { eliminataIl: null, OR: precise as never },
          orderBy: { ultimoMessaggioIl: 'desc' },
          take: 40,
          select: campi,
        })
      : Promise.resolve([]),
    // Le conversazioni WhatsApp si prendono tutte e si filtrano in memoria per
    // coda del numero: sono poche, ed è l'unico modo di non perderne nessuna.
    coda
      ? db.conversazione.findMany({
          where: { canale: 'whatsapp', eliminataIl: null },
          orderBy: { ultimoMessaggioIl: 'desc' },
          select: campi,
        })
      : Promise.resolve([]),
  ])

  // ⚠️ Dedup per id: una chat WhatsApp che cita anche il numero d'ordine esce
  // da tutte e due le query, e comparirebbe due volte nel riquadro.
  const viste = new Set<string>()
  const righe = [...daPrecise, ...daChat].filter((c) => {
    if (viste.has(c.id)) return false
    viste.add(c.id)
    return true
  })
  righe.sort((a, b) => b.ultimoMessaggioIl.getTime() - a.ultimoMessaggioIl.getTime())

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
  // ⚠️ Il tetto sta QUI, dopo aver riconosciuto i legami: tagliare prima vuol
  // dire tagliare a caso, ed è il difetto appena tolto.
  return fuori.slice(0, 40)
}

/**
 * Quali ordini, fra quelli in elenco, hanno messaggi — in due query sole.
 *
 * ⚠️ Non si fa una query per ordine: con 200 ordini a schermo sarebbero 200
 * andate e ritorni al database a ogni caricamento della bacheca, e la pagina si
 * pianta. Si prendono le conversazioni una volta e si incrociano in memoria.
 */
export type MessaggiDiUnOrdine = {
  quanti: number
  nonLetti: number
  /**
   * La conversazione più recente fra quelle collegate.
   *
   * ⚠️⚠️ Serve perché il bollino «✉ 2» sulla scheda **dicesse** che ci sono
   * messaggi senza dare modo di leggerli: bisognava aprire l'ordine, scendere
   * fino al riquadro dei messaggi e da lì capire di quale conversazione si
   * trattava. Un'informazione che non porta dove serve è un'informazione a
   * metà — e nella pratica vuol dire che i messaggi non si leggono.
   * ⚠️ La PIÙ RECENTE, non la prima trovata: un cliente che ha scritto tre
   * volte vuole risposta sull'ultima.
   */
  conversazioneId: string
}

export async function ordiniConMessaggi(
  ordini: { id: string; numero: string; email: string; telefono: string }[]
): Promise<Map<string, MessaggiDiUnOrdine>> {
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
          select: {
            id: true,
            idEsterno: true,
            canale: true,
            ordineNumero: true,
            nonLetti: true,
            ultimoMessaggioIl: true,
          },
        })
      : Promise.resolve([]),
    // Le conversazioni WhatsApp sono poche: si prendono tutte e si confrontano
    // per coda del numero, che in SQL non si può indicizzare.
    db.conversazione.findMany({
      where: { canale: 'whatsapp', eliminataIl: null },
      select: { id: true, idEsterno: true, nonLetti: true, ultimoMessaggioIl: true },
    }),
  ])

  const perCoda = new Map<string, MessaggiDiUnOrdine & { quando: Date }>()
  for (const c of chat) {
    const coda = telefonoConfrontabile(c.idEsterno)
    if (!coda) continue
    const prec = perCoda.get(coda)
    // ⚠️ Si tiene l'id della più recente: `prec` può essere di ieri.
    const piuRecente = !prec || c.ultimoMessaggioIl > prec.quando
    perCoda.set(coda, {
      quanti: (prec?.quanti ?? 0) + 1,
      nonLetti: (prec?.nonLetti ?? 0) + c.nonLetti,
      conversazioneId: piuRecente ? c.id : prec.conversazioneId,
      quando: piuRecente ? c.ultimoMessaggioIl : prec.quando,
    })
  }

  const fuori = new Map<string, MessaggiDiUnOrdine>()
  for (const o of ordini) {
    let quanti = 0
    let nonLetti = 0
    let conversazioneId = ''
    let quando: Date | null = null
    for (const c of perNumeroEmail) {
      const perNumero = o.numero && c.ordineNumero === o.numero
      const perEmail =
        o.email && c.canale === 'email' && c.idEsterno.toLowerCase() === o.email.toLowerCase()
      if (perNumero || perEmail) {
        quanti++
        nonLetti += c.nonLetti
        if (!quando || c.ultimoMessaggioIl > quando) {
          quando = c.ultimoMessaggioIl
          conversazioneId = c.id
        }
      }
    }
    const coda = telefonoConfrontabile(o.telefono ?? '')
    const daChat = coda ? perCoda.get(coda) : undefined
    if (daChat) {
      quanti += daChat.quanti
      nonLetti += daChat.nonLetti
      if (!quando || daChat.quando > quando) {
        quando = daChat.quando
        conversazioneId = daChat.conversazioneId
      }
    }
    if (quanti) fuori.set(o.id, { quanti, nonLetti, conversazioneId })
  }
  return fuori
}
