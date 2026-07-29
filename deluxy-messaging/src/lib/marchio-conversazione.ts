// A quale marchio appartiene una conversazione.
//
// Sta in un posto solo perché la risposta serve in due: la pagina `/inbox` (il
// primo caricamento) e `/api/conversazioni` (l'aggiornamento automatico ogni 5
// secondi). Quando le due logiche erano scritte a mano, il marchio compariva al
// caricamento e spariva al primo aggiornamento — e adesso che l'inbox è a
// colonne, sparire vuol dire cambiare colonna sotto le mani di chi lavora.
//
// Ogni canale dice il marchio a modo suo:
//  - WhatsApp: il `phone_number_id` che ha ricevuto → il numero collegato;
//  - Messenger e Instagram: l'id dell'account nostro → la pagina collegata;
//  - Email: la CASELLA che ha ricevuto, perché una mail non porta con sé un
//    «nostro numero»; il marchio della casella lo dichiara una persona.
// Vuoto è una risposta onesta: vuol dire «non lo sappiamo», non «Deluxy».

import { db } from './db'
import { brandPerNumero } from './numeri-whatsapp'
import { brandPerPagina } from './pagine-meta'

type ConversazioneMinima = { canale: string; numeroId: string; casellaId: string }

export async function risolutoreMarchio(): Promise<(c: ConversazioneMinima) => string> {
  const [numeri, pagine, caselle] = await Promise.all([
    brandPerNumero(),
    brandPerPagina(),
    db.casellaEmail.findMany({ select: { id: true, negozio: { select: { nome: true } } } }),
  ])
  // `numeroId` porta il numero WhatsApp o l'id dell'account Meta a seconda del
  // canale: qui la distinzione non serve più.
  const perAccount = new Map([...numeri, ...pagine])
  const perCasella = new Map(caselle.map((c) => [c.id, c.negozio?.nome ?? '']))

  return (c) =>
    (c.canale === 'email' ? perCasella.get(c.casellaId) : perAccount.get(c.numeroId)) ?? ''
}
