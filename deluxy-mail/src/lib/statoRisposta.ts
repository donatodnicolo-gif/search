import type { Messaggio } from '@prisma/client'
import { db } from './db'

// «A questa mail ho già risposto?» — la domanda che ci si fa aprendo una mail.
//
// ⚠️ NON basta sapere che nella conversazione, prima o poi, è partita una nostra
// mail: in un thread di quattro messaggi è quasi sempre vero e non dice niente.
// Quello che serve sapere è se c'è una nostra risposta **DOPO questo messaggio**
// — cioè se la palla è ancora nostra. Per questo si distinguono due cose:
//   · `dopo`   → abbiamo risposto a QUESTA mail (o comunque dopo di lei);
//   · `prima`  → abbiamo scritto in questa conversazione, ma prima che
//                arrivasse: la mail è ancora da rispondere.
//
// In elenco l'icona ↩ risponde alla domanda più larga («questa conversazione ha
// una nostra risposta»): è giusto lì, dove si scorre. Qui serve più preciso.
//
// ⚠️ L'indice `@@index([utenteId, direzione, thread])` esiste apposta per queste
// due query: senza, erano due scansioni dell'intera casella.

export type StatoRisposta = {
  /** Nostra mail in uscita successiva a questo messaggio. */
  dopo: Date | null
  /** Nostra mail in uscita precedente (o pari) a questo messaggio. */
  prima: Date | null
  /** L'ultima uscita era un inoltro e non una risposta. */
  soloInoltro: boolean
}

export async function statoRisposta(utenteId: string, m: Messaggio): Promise<StatoRisposta> {
  const vuoto: StatoRisposta = { dopo: null, prima: null, soloInoltro: false }
  // Una mail che abbiamo mandato NOI non ha bisogno di questo segnale.
  if (m.direzione === 'uscita') return vuoto

  const radice = m.thread || m.messageId
  const aggancio = m.threadManuale
  if (!radice && !aggancio) return vuoto

  const dove = {
    utenteId,
    direzione: 'uscita',
    OR: [
      ...(radice ? [{ thread: radice }] : []),
      // ⚠️ Gli INOLTRI non ereditano la radice del thread: sono legati
      // all'originale solo dall'aggancio manuale. Senza questo ramo, inoltrare
      // una mail non risulterebbe da nessuna parte.
      ...(aggancio ? [{ threadManuale: aggancio }] : []),
    ],
  }

  try {
    const [ultimaDopo, ultimaPrima] = await Promise.all([
      db.messaggio.findFirst({
        where: { ...dove, data: { gt: m.data } },
        orderBy: { data: 'desc' },
        select: { data: true, modoInvio: true },
      }),
      db.messaggio.findFirst({
        where: { ...dove, data: { lte: m.data } },
        orderBy: { data: 'desc' },
        select: { data: true },
      }),
    ])
    return {
      dopo: ultimaDopo?.data ?? null,
      prima: ultimaPrima?.data ?? null,
      soloInoltro: ultimaDopo?.modoInvio === 'inoltra',
    }
  } catch {
    // Il segnale è un di più: se la query non riesce, la mail si apre lo stesso.
    return vuoto
  }
}
