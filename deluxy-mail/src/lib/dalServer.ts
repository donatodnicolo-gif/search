'use client'

import { corpoEAllegatiDalServer } from './actions'

export type DalServer = Awaited<ReturnType<typeof corpoEAllegatiDalServer>>

/**
 * Le chiamate «dal server» in volo, per messaggio.
 *
 * ⚠️⚠️ PERCHÉ (revisione prestazioni 28/08/2026). Aprendo una mail, il corpo
 * (`CorpoMessaggio`) e gli allegati (`AllegatiMessaggio`) sono due componenti
 * distinti, e ognuno chiedeva al server la sua parte con una propria azione:
 * due connessioni IMAP per la stessa mail. Ma i due componenti si montano
 * INSIEME, nello stesso istante: se condividono la stessa promessa, parte una
 * chiamata sola — cioè una connessione sola.
 *
 * La chiave è il momento: al mount i due effetti girano nello stesso giro,
 * prima che la promessa si risolva, quindi trovano la stessa voce in volo. La
 * voce si toglie quando la promessa finisce, così una riapertura più tardi
 * ricarica dati freschi (gli allegati di una mail non cambiano, ma non si
 * vuole una cache che invecchia in silenzio).
 *
 * ⚠️ Non peggiora mai: se per qualche motivo i due non coincidono, si torna a
 * due chiamate — cioè al comportamento di prima, mai a qualcosa di peggio.
 */
const inVolo = new Map<string, Promise<DalServer>>()

export function dalServerCondiviso(id: string): Promise<DalServer> {
  const gia = inVolo.get(id)
  if (gia) return gia
  const p = corpoEAllegatiDalServer(id).finally(() => inVolo.delete(id))
  inVolo.set(id, p)
  return p
}
