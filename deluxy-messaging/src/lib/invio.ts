// Mandare un messaggio sul canale della conversazione — in un posto solo.
//
// Perché una libreria e non il codice dentro la rotta: le regole di «da quale
// nostro account esce la risposta» sono delicate (si risponde SEMPRE dal numero
// o dalla pagina che ha ricevuto, altrimenti al cliente dei fiori scrive la
// pasticceria) e da oggi non c'è più un solo chiamante: risponde l'operatore
// dalla inbox, e risponde la **risposta di primo contatto** in automatico. Due
// copie di queste regole sarebbero due comportamenti che divergono al primo
// ritocco.

import type { Conversazione } from '@prisma/client'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaPagina, inviaWhatsApp } from '@/lib/meta'
import { casellaPerId, inviaEmail } from '@/lib/email'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { tokenPerPagina } from '@/lib/pagine-meta'
import { db } from '@/lib/db'

export type EsitoInvio = { ok: true; idEsterno: string } | { ok: false; errore: string }

/**
 * Manda `testo` al cliente sul canale della sua conversazione.
 *
 * Non scrive niente in tabella: il messaggio lo registra chi chiama, perché i
 * due chiamanti lo registrano in modo diverso (l'operatore col proprio nome, la
 * risposta automatica senza nessun nome).
 */
export async function inviaSulCanale(
  conversazione: Conversazione,
  testo: string
): Promise<EsitoInvio> {
  switch (conversazione.canale) {
    case 'whatsapp': {
      // ⚠️ SI RISPONDE DAL NUMERO CHE HA RICEVUTO, non da quello impostato.
      //
      // La holding ha più WhatsApp Business (Deluxy Flowers, Cake Design,
      // Deluxy Cake Delivery…). Con un solo `waPhoneNumberId` nelle
      // Impostazioni, a un cliente che ha scritto ai fiori avremmo risposto dal
      // numero della pasticceria: dal suo telefono è un'altra azienda che gli
      // scrive di punto in bianco su un ordine che non ha fatto lì.
      // `numeroId` della conversazione è quello vero, letto dal webhook di Meta;
      // l'impostazione resta come ripiego per le conversazioni vecchie, che il
      // numero non l'hanno registrato.
      const { waPhoneNumberId } = await leggiImpostazioni(['waPhoneNumberId'])
      const numeroDaCuiRispondere = conversazione.numeroId || waPhoneNumberId
      // Ogni numero può avere il suo token (account Meta diversi); se non ce
      // l'ha si usa quello generale delle Impostazioni.
      const tokenDiQuelNumero = await tokenPerNumero(numeroDaCuiRispondere)
      if (!tokenDiQuelNumero || !numeroDaCuiRispondere) {
        return {
          ok: false,
          errore: 'WhatsApp non configurato: token o Phone Number ID mancanti (Impostazioni).',
        }
      }
      return inviaWhatsApp(
        tokenDiQuelNumero,
        numeroDaCuiRispondere,
        conversazione.idEsterno,
        testo
      )
    }
    case 'messenger':
    case 'instagram': {
      // ⚠️ Stessa regola di WhatsApp: si risponde DALL'ACCOUNT CHE HA RICEVUTO.
      const nostroAccount = conversazione.numeroId
      const tokenDiQuellAccount = await tokenPerPagina(conversazione.canale, nostroAccount)
      if (!tokenDiQuellAccount) {
        return {
          ok: false,
          errore:
            conversazione.canale === 'instagram'
              ? 'Instagram non configurato: nessun token per questo account (pagina Facebook e Instagram).'
              : 'Messenger non configurato: nessun Page Access Token per questa pagina (pagina Facebook e Instagram).',
        }
      }
      // ⚠️ Il canale viaggia fino in fondo: Instagram con un token IGAA parla
      // solo con `graph.instagram.com`, e senza questo i direct si ricevevano
      // ma non si potevano mandare.
      return inviaPagina(
        tokenDiQuellAccount,
        conversazione.idEsterno,
        testo,
        nostroAccount,
        conversazione.canale
      )
    }
    case 'widget':
      // Il widget non ha un invio esterno: il visitatore riceve col suo polling.
      return { ok: true, idEsterno: '' }
    case 'email': {
      // Si risponde dalla casella che ha ricevuto; se non c'è, dalla predefinita.
      const casella = await casellaPerId(conversazione.casellaId)
      if (!casella) {
        return { ok: false, errore: 'Nessuna casella di posta configurata (pagina Caselle).' }
      }
      // L'oggetto della risposta segue l'ultima mail ricevuta: "Re: …".
      const ultima = await db.messaggio.findFirst({
        where: { conversazioneId: conversazione.id, direzione: 'in', oggetto: { not: '' } },
        orderBy: { creatoIl: 'desc' },
        select: { oggetto: true },
      })
      const oggetto = ultima?.oggetto
        ? /^re:/i.test(ultima.oggetto)
          ? ultima.oggetto
          : `Re: ${ultima.oggetto}`
        : 'Messaggio da Deluxy'
      try {
        const idMsg = await inviaEmail(casella, conversazione.idEsterno, oggetto, testo)
        return { ok: true, idEsterno: idMsg }
      } catch (e) {
        return { ok: false, errore: `Invio non riuscito: ${(e as Error).message}` }
      }
    }
    default:
      return { ok: false, errore: `Canale sconosciuto: ${conversazione.canale}` }
  }
}
