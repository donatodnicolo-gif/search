// Da quale nostro numero WhatsApp è arrivato un messaggio, e a quale brand
// appartiene quel numero.
//
// La holding ha più WhatsApp Business — Deluxy Flowers, Cake Design, Deluxy Cake
// Delivery — e il webhook di Meta dice sempre su quale è arrivato
// (`metadata.phone_number_id`). Qui quel numero si traduce nel nome del brand,
// che è quello che serve a chi risponde: «Deluxy Flowers» si legge, un
// `phone_number_id` di quindici cifre no.
//
// Il collegamento numero → brand lo dichiara una persona in Negozi
// (`NegozioShopify.waPhoneNumberId`). Non si indovina dal numero: due marchi
// possono avere numeri consecutivi e non c'è niente nella cifra che dica di chi
// è.

import { db } from './db'

/** Mappa `phone_number_id` → nome del brand, per i negozi che l'hanno dichiarato. */
export async function brandPerNumero(): Promise<Map<string, string>> {
  const negozi = await db.negozioShopify.findMany({
    where: { waPhoneNumberId: { not: '' } },
    select: { nome: true, waPhoneNumberId: true },
  })
  return new Map(negozi.map((n) => [n.waPhoneNumberId, n.nome]))
}

/**
 * Aggiunge a ogni conversazione il nome del brand del numero che ha ricevuto.
 *
 * Se il numero non è collegato a nessun brand torna stringa vuota e l'inbox
 * mostra il numero grezzo: meglio un numero che niente, e chi lo vede capisce
 * che manca il collegamento in Negozi.
 */
export function conBrand<T extends { numeroId: string; numeroNostro: string }>(
  righe: T[],
  mappa: Map<string, string>
): (T & { brand: string })[] {
  return righe.map((c) => ({ ...c, brand: mappa.get(c.numeroId) ?? '' }))
}
