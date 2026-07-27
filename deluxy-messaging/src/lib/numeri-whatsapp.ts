// I numeri WhatsApp Business collegati: quale marchio rappresentano e con quale
// token si risponde da ciascuno.
//
// La holding ha più WhatsApp Business — Deluxy Flowers, Cake Design, Deluxy Cake
// Delivery — e il webhook di Meta dice sempre su quale è arrivato un messaggio
// (`metadata.phone_number_id`, salvato in `Conversazione.numeroId`). Qui quel
// numero si traduce nel nome del marchio, che è ciò che serve a chi risponde:
// «Deluxy Flowers» si legge, un `phone_number_id` di quindici cifre no.
//
// ⚠️ Il collegamento numero → marchio lo dichiara una persona: non si indovina.
// Due marchi possono avere numeri consecutivi e non c'è niente nelle cifre che
// dica di chi sono.

import { db } from './db'
import { decifra } from './crypto'
import { leggiImpostazioni } from './impostazioni'

export type NumeroCollegato = {
  id: string
  nome: string
  phoneNumberId: string
  numeroVisibile: string
  wabaId: string
  negozioId: string | null
  brand: string
  attivo: boolean
  /** Ha un token suo, o usa quello generale delle Impostazioni? */
  tokenProprio: boolean
}

/** Tutti i numeri collegati, col nome del marchio già risolto. */
export async function numeriCollegati(): Promise<NumeroCollegato[]> {
  const righe = await db.numeroWhatsApp.findMany({
    include: { negozio: { select: { nome: true } } },
    orderBy: [{ attivo: 'desc' }, { nome: 'asc' }],
  })
  return righe.map((n) => ({
    id: n.id,
    nome: n.nome,
    phoneNumberId: n.phoneNumberId,
    numeroVisibile: n.numeroVisibile,
    wabaId: n.wabaId,
    negozioId: n.negozioId,
    brand: n.negozio?.nome ?? '',
    attivo: n.attivo,
    tokenProprio: Boolean(n.token),
  }))
}

/**
 * Mappa `phone_number_id` → nome da mostrare in Inbox.
 *
 * Si preferisce il marchio all'etichetta del numero: a chi risponde interessa
 * sapere che ha scritto a «Cake Design», non che la linea si chiama «numero 2».
 * Se il numero non è collegato a nessun marchio si usa la sua etichetta, e se
 * manca anche quella l'inbox mostra il numero grezzo — meglio del nulla, e si
 * capisce che manca un collegamento.
 */
export async function brandPerNumero(): Promise<Map<string, string>> {
  const righe = await db.numeroWhatsApp.findMany({
    include: { negozio: { select: { nome: true } } },
  })
  return new Map(
    righe.map((n) => [n.phoneNumberId, n.negozio?.nome || n.nome || n.numeroVisibile])
  )
}

/**
 * Il token con cui rispondere da un certo numero.
 *
 * Ordine: il token del numero, poi quello generale delle Impostazioni. Il
 * ripiego non è pigrizia — con un solo utente di sistema Meta lo stesso token
 * vale per tutti i numeri dello stesso Business Manager, e farlo riscrivere per
 * ogni linea moltiplicherebbe le copie di un segreto senza aggiungere niente.
 */
export async function tokenPerNumero(phoneNumberId: string): Promise<string> {
  if (phoneNumberId) {
    const n = await db.numeroWhatsApp.findUnique({ where: { phoneNumberId } })
    if (n?.token) {
      try {
        return decifra(n.token)
      } catch {
        // Token illeggibile (APP_SECRET cambiato): si prova col generale invece
        // di far fallire l'invio con un errore che non spiega niente.
      }
    }
  }
  const c = await leggiImpostazioni(['waToken'])
  return c.waToken ?? ''
}

/**
 * Il numero da cui rispondere a una conversazione.
 *
 * ⚠️ È quello che HA RICEVUTO, non quello «predefinito»: rispondere a un
 * cliente dei fiori dal numero della pasticceria, dal suo telefono, è un'altra
 * azienda che gli scrive di punto in bianco su un ordine che non ha fatto lì.
 * L'impostazione generale resta solo per le conversazioni vecchie, nate prima
 * che registrassimo il numero ricevente.
 */
export async function numeroPerRisposta(numeroIdConversazione: string): Promise<string> {
  if (numeroIdConversazione) return numeroIdConversazione
  const c = await leggiImpostazioni(['waPhoneNumberId'])
  return c.waPhoneNumberId ?? ''
}
