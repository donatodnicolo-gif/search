// MANDARE UN ORDINE «IN APP»: dalla scheda dell'ordine alla piattaforma consegne.
//
// Chiesto dall'utente: «ho bisogno di un nuovo stato prima di Gestito che sia In
// App e indichi che l'ordine è stato spostato in app; prendi lo stesso form che
// si usa di là per inserire una consegna da vendita».
//
// ⚠️⚠️ SI PASSA DALLA STESSA PORTA DEL FORM DI LÀ (`POST /api/v1/app/consegne`,
// dichiarata «stessa strada del form: prezzo dal listino del partner, paga dal
// listino del valet, attività e notifiche»). Scrivere la consegna in un altro
// modo vorrebbe dire una consegna senza prezzo, senza paga e senza avvisi:
// esisterebbe e non funzionerebbe. Per lo stesso motivo i campi di questo
// modulo sono i campi di quel form — non un sottoinsieme comodo.
//
// ⚠️⚠️ IL PREFILL VIENE DALLE STESSE FONTI DEL FORM DI LÀ: il form della
// piattaforma, arrivando da una vendita, legge `GET /sales/:id` e prende
// partner, servizio, destinatario e data. Qui si legge la stessa vendita
// (`/app/vendite/by-ref/…`) per il PARTNER, e il destinatario dal nostro ordine
// — che è più fresco, perché l'indirizzo di consegna lo possiede Orders.
//
// ⚠️ Quello che manca resta VUOTO e lo compila una persona: meglio un campo da
// riempire che un dato dedotto su una consegna vera.

import { db } from './db'
import { righeOrdineDaOrders } from './orders'
import {
  creaConsegnaInPiattaforma,
  portaVenditaInConsegna,
  venditaPerOrdineOrders,
  type NuovaConsegna,
} from './piattaforma'

export type PrefillInApp = {
  /** L'ordine c'è e si può mandare? Se no, `perche` lo dice. */
  ok: boolean
  perche: string
  ordineNumero: string
  ordersId: string
  /** L'id della vendita di là, quando esiste: apre il form della piattaforma. */
  venditaId: string
  venditaStato: string
  /** Il partner della vendita: senza, la piattaforma non accetta la consegna. */
  partnerId: string
  partnerNome: string
  /** I campi del modulo, già riempiti con quello che sappiamo. */
  campi: NuovaConsegna
}

/** «16-20» → { da: '16:00', a: '20:00' }. Vuoto se non si capisce. */
export function fasciaInOrari(fascia: string): { da: string; a: string } {
  const m = (fascia ?? '').match(/(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/)
  if (!m) return { da: '', a: '' }
  const due = (h: string, min?: string) => `${h.padStart(2, '0')}:${(min ?? '00').padStart(2, '0')}`
  return { da: due(m[1], m[2]), a: due(m[3], m[4]) }
}

/** «Mario Rossi Bianchi» → nome + cognome. Il cognome vuoto non si inventa. */
function spezzaNome(intero: string): { nome: string; cognome: string } {
  const pezzi = (intero ?? '').trim().split(/\s+/).filter(Boolean)
  return { nome: pezzi[0] ?? '', cognome: pezzi.slice(1).join(' ') }
}

/**
 * Quello che serve al modulo, letto dove sta.
 *
 * ⚠️ Non fallisce mai in blocco: se la piattaforma non risponde, il modulo si
 * apre lo stesso coi dati dell'ordine e lo dice. Chi ha l'ordine davanti deve
 * poter vedere cosa manca, non una pagina che non si apre.
 */
export async function prefillInApp(ordineId: string): Promise<PrefillInApp | null> {
  const o = await db.ordine.findUnique({ where: { id: ordineId } })
  if (!o) return null

  const vuoto: PrefillInApp = {
    ok: true,
    perche: '',
    ordineNumero: o.numero,
    ordersId: o.ordersId ?? '',
    venditaId: '',
    venditaStato: '',
    partnerId: '',
    partnerNome: '',
    campi: {
      date: o.dataConsegna ? o.dataConsegna.toISOString().slice(0, 10) : '',
      serviceTypeId: '',
      recipientFirstName: '',
      recipientLastName: '',
      recipientAddress: '',
      recipientPhone: o.telefono ?? '',
      recipientEmail: '',
      senderFirstName: '',
      senderLastName: '',
      senderPhone: o.telefono ?? '',
      deliveryTimeFrom: '',
      deliveryTimeTo: '',
      notes: '',
      ddtNumber: (o.numero ?? '').replace(/^#/, ''),
      ddtBrand: o.negozioNome ?? '',
      riferimentoEsterno: o.ordersId ?? o.id,
    },
  }

  const fascia = fasciaInOrari(o.fasciaConsegna ?? '')
  vuoto.campi.deliveryTimeFrom = fascia.da
  vuoto.campi.deliveryTimeTo = fascia.a

  // ⚠️ IL DESTINATARIO VIENE DALLA SPEDIZIONE, non dal cliente: chi ordina e chi
  // riceve sono due persone diverse in quasi tutti i nostri ordini — è un
  // regalo. Mandare il valet dal mittente è l'errore più facile e più grave.
  const righe = await righeOrdineDaOrders(o.numero, o.shopifyId)
  if (righe.stato === 'ok' && righe.spedizione) {
    const s = righe.spedizione
    const n = spezzaNome(s.nome)
    vuoto.campi.recipientFirstName = n.nome
    vuoto.campi.recipientLastName = n.cognome
    vuoto.campi.recipientAddress = [s.indirizzo, s.cap, s.citta, s.provincia]
      .map((x) => (x ?? '').trim())
      .filter(Boolean)
      .join(', ')
  } else {
    // Ripiego sulla nostra copia: meno fresca, ma meglio di niente — e si vede
    // subito che manca qualcosa, perché i campi restano da correggere.
    vuoto.campi.recipientAddress = [o.indirizzo, o.citta].filter(Boolean).join(', ')
  }

  const mittente = spezzaNome(o.clienteNome ?? '')
  vuoto.campi.senderFirstName = mittente.nome
  vuoto.campi.senderLastName = mittente.cognome

  // La vendita di là: da lei arriva il PARTNER, come nel form della piattaforma.
  if (o.ordersId) {
    const v = await venditaPerOrdineOrders(o.ordersId)
    if (v.stato === 'ok') {
      vuoto.venditaId = v.dati.vendita.id
      vuoto.venditaStato = v.dati.vendita.stato
      vuoto.partnerId = v.dati.vendita.partner?.id ?? ''
      vuoto.partnerNome = v.dati.vendita.partner?.insegna ?? ''
      vuoto.campi.partnerId = vuoto.partnerId
      // ⚠️ Se di là c'è GIÀ una consegna, non se ne fa un'altra: si dice che
      // c'è. Due consegne per un ordine sono due valet, due paghe e un cliente
      // che riceve due volte.
      if (v.dati.consegna) {
        vuoto.ok = false
        vuoto.perche = `Questo ordine ha già una consegna in piattaforma (${v.dati.consegna.stato}).`
      }
    } else if (v.stato === 'non-configurato') {
      vuoto.ok = false
      vuoto.perche =
        'La chiave della piattaforma non è configurata (Impostazioni): senza, da qui non si può creare niente di là.'
    } else if (v.stato === 'errore') {
      // ⚠️ Non blocca: la consegna si può creare lo stesso (senza il partner
      // della vendita, che allora si sceglie a mano). Ma si DICE, o si
      // penserebbe che il partner vuoto sia normale.
      vuoto.perche = v.messaggio
    }
  } else {
    vuoto.perche =
      "Quest'ordine non ha ancora un id in Deluxy Orders: la vendita di là non si può agganciare, ma la consegna si può creare lo stesso."
  }

  return vuoto
}

export type EsitoInApp =
  | { ok: true; numero: string; id: string; venditaAgganciata: boolean; nota: string }
  | { ok: false; errore: string }

/**
 * Crea la consegna nella piattaforma e porta l'ordine nello stato «In App».
 *
 * ⚠️⚠️ L'ORDINE DELLE TRE COSE NON È CASUALE:
 *  1. si crea la consegna (è l'unica cosa che può fallire per davvero);
 *  2. si scrive il nostro stato — solo se la consegna esiste;
 *  3. si dice alla vendita di andare in storico, **best-effort**: se questa
 *     fallisce la consegna c'è comunque, e rifare tutto creerebbe un doppione.
 * Segnare «In App» prima di aver creato la consegna vorrebbe dire fermare il
 * nostro lavoro su un ordine che di là non è mai arrivato.
 */
export async function mandaInApp(
  ordineId: string,
  campi: NuovaConsegna,
  chi: { id: string; nome: string } | null
): Promise<EsitoInApp> {
  const o = await db.ordine.findUnique({ where: { id: ordineId } })
  if (!o) return { ok: false, errore: 'Ordine non trovato.' }

  const mancanti: string[] = []
  if (!campi.date?.trim()) mancanti.push('la data')
  if (!campi.serviceTypeId?.trim()) mancanti.push('il tipo di servizio')
  if (!campi.partnerId?.trim()) mancanti.push('il partner')
  if (!campi.recipientFirstName?.trim() && !campi.recipientLastName?.trim())
    mancanti.push('il nome del destinatario')
  if (!campi.recipientAddress?.trim()) mancanti.push("l'indirizzo di consegna")
  if (mancanti.length) {
    return {
      ok: false,
      // ⚠️ Si dice COSA manca, non «campi obbligatori»: chi ha il cliente al
      // telefono deve sapere cosa chiedergli.
      errore: `Prima di mandarla in app serve ${mancanti.join(', ')}.`,
    }
  }

  const esito = await creaConsegnaInPiattaforma({
    ...campi,
    // ⚠️ Il riferimento lo decidiamo NOI e non l'utente: è quello che rende la
    // creazione idempotente di là (stesso riferimento = stessa consegna). Se lo
    // lasciassimo modificabile, due invii dello stesso ordine con riferimenti
    // diversi diventerebbero due consegne.
    riferimentoEsterno: o.ordersId || o.id,
  })

  if (esito.stato === 'non-configurato') {
    return {
      ok: false,
      errore:
        'La chiave della piattaforma non è configurata: mettila in Impostazioni (serve una chiave con permesso di scrittura).',
    }
  }
  if (esito.stato === 'errore') return { ok: false, errore: esito.messaggio }
  if (esito.stato === 'non-trovato') {
    return { ok: false, errore: 'La piattaforma non ha trovato la rotta delle consegne.' }
  }

  const numero = String(esito.dati.number ?? esito.dati.numero ?? '')
  const idConsegna = String(esito.dati.id ?? '')

  await db.ordine.update({
    where: { id: ordineId },
    data: {
      // ⚠️ «In App» è uno stato NOSTRO: dice che di quell'ordine si occupa la
      // piattaforma, e serve a non cercare un fornitore a mano su un lavoro che
      // qualcun altro sta già facendo.
      gestione: 'in_app',
      gestioneDaId: chi?.id ?? '',
      gestioneDaNome: chi?.nome ?? '',
      gestioneIl: new Date(),
      appConsegnaId: idConsegna,
      appConsegnaNumero: numero,
      appMandataIl: new Date(),
      appMandataDaNome: chi?.nome ?? '',
      // ⚠️ Si azzera l'interruzione: se qualcuno l'aveva ripreso a mano e adesso
      // lo rimanda in app, la sincronizzazione deve poterlo seguire di nuovo.
      appInterrottoIl: null,
    },
  })

  let venditaAgganciata = false
  if (o.ordersId && idConsegna) {
    const r = await portaVenditaInConsegna(o.ordersId, idConsegna)
    venditaAgganciata = r.stato === 'ok'
  }

  return {
    ok: true,
    numero,
    id: idConsegna,
    venditaAgganciata,
    nota: venditaAgganciata
      ? `Consegna ${numero || 'creata'} in piattaforma: la vendita è passata in storico.`
      : `Consegna ${numero || 'creata'} in piattaforma. ⚠️ La vendita di là NON è stata segnata come presa in carico: controllala, ma non rifare la consegna.`,
  }
}
