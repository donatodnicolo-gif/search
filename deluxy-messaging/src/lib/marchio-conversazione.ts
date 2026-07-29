// A quale marchio appartiene una conversazione, e su quale nostro account è
// arrivata. Sono due cose diverse e vanno tenute separate.
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
//
// ⚠️ **Il MARCHIO è solo il negozio collegato, mai l'etichetta dell'account.**
// L'etichetta è un nome che ci siamo dati noi («CakeDesignMe» sul numero di
// Cake): usarla come marchio faceva nascere una colonna in più, che sembrava un
// quarto brand mentre era lo stesso di «Cake» con un altro nome. Un account
// senza negozio finisce in «Senza marchio» — che è vero, e si vede che manca un
// collegamento invece di credere a un marchio che non esiste.
// L'etichetta resta buona per il badge della riga, dove dice su quale linea è
// arrivato il messaggio: per quello si usa `etichettaDi`.

import { db } from './db'

type ConversazioneMinima = { canale: string; numeroId: string; casellaId: string }

export type Marchi = {
  /** Il negozio, o stringa vuota se l'account non ne ha uno: decide la colonna. */
  marchioDi: (c: ConversazioneMinima) => string
  /** Come si chiama la linea che ha ricevuto: per il badge, non per la colonna. */
  etichettaDi: (c: ConversazioneMinima) => string
}

export async function risolutoreMarchio(): Promise<Marchi> {
  const [numeri, pagine, caselle] = await Promise.all([
    db.numeroWhatsApp.findMany({
      select: {
        phoneNumberId: true,
        nome: true,
        numeroVisibile: true,
        negozio: { select: { nome: true } },
      },
    }),
    db.paginaMeta.findMany({
      select: {
        idPagina: true,
        nome: true,
        riferimento: true,
        negozio: { select: { nome: true } },
      },
    }),
    db.casellaEmail.findMany({
      select: { id: true, nome: true, indirizzo: true, negozio: { select: { nome: true } } },
    }),
  ])

  // `numeroId` porta il numero WhatsApp o l'id dell'account Meta a seconda del
  // canale: qui la distinzione non serve più.
  const marchioAccount = new Map<string, string>([
    ...numeri.map((n) => [n.phoneNumberId, n.negozio?.nome ?? ''] as const),
    ...pagine.map((p) => [p.idPagina, p.negozio?.nome ?? ''] as const),
  ])
  const etichettaAccount = new Map<string, string>([
    ...numeri.map((n) => [n.phoneNumberId, n.nome || n.numeroVisibile] as const),
    ...pagine.map((p) => [p.idPagina, p.riferimento || p.nome] as const),
  ])
  const marchioCasella = new Map(caselle.map((c) => [c.id, c.negozio?.nome ?? '']))
  const etichettaCasella = new Map(caselle.map((c) => [c.id, c.nome || c.indirizzo]))

  return {
    marchioDi: (c) =>
      (c.canale === 'email' ? marchioCasella.get(c.casellaId) : marchioAccount.get(c.numeroId)) ??
      '',
    etichettaDi: (c) =>
      (c.canale === 'email'
        ? etichettaCasella.get(c.casellaId)
        : etichettaAccount.get(c.numeroId)) ?? '',
  }
}
