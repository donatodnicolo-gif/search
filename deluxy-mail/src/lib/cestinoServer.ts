import { after } from 'next/server'
import { db } from './db'
import { spostaSulServer, trovaCartellaCestino } from './imap'

/**
 * FAR SEGUIRE AL SERVER quello che fai col cestino.
 *
 * Fino al 5/08/2026 cestinare era un fatto solo di AI Mail: la mail spariva da
 * qui e restava intatta nella INBOX della casella. Aprendo la posta dal
 * telefono o dalla webmail te la ritrovavi lì, e la casella non si sgonfiava
 * mai (solo «svuota cestino» toccava il server, cancellando).
 *
 * Ora cestinare **sposta** la mail nella cartella Cestino della casella, e
 * recuperarla la riporta in INBOX.
 *
 * ⚠️ Si SPOSTA, non si cancella: è reversibile, ed è la ragione per cui questo
 * può girare da solo senza chiedere niente, mentre svuotare il cestino resta
 * un'azione dichiarata (quella cancella per sempre).
 * ⚠️ Gira in `after()`: è una connessione IMAP per giro, e cestinare dieci mail
 * di fila non deve far aspettare nessuno. Se fallisce, **il cestino di AI Mail
 * resta quello buono**: la mail è comunque fuori dai piedi qui, e al massimo il
 * server non è allineato — mai il contrario.
 * ⚠️ Le copie senza riscontro sul server (`uid <= 0` e senza Message-ID) si
 * saltano: non c'è niente da spostare.
 */
export function allineaCestinoDopo(utenteId: string, ids: string[], verso: 'cestino' | 'inbox'): void {
  if (ids.length === 0) return
  after(async () => {
    try {
      await allineaCestinoOra(utenteId, ids, verso)
    } catch {
      /* il server non ha seguito: qui la mail è già a posto, si riproverà
         alla prossima occasione (o resterà solo un disallineamento visibile
         dalla webmail). Non c'è niente da annullare. */
    }
  })
}

/**
 * In quale cartella della casella sta ORA questa mail: serve a chi va sul
 * server a riprendere qualcosa (impaginato HTML, allegati, download).
 *
 * ⚠️ Da quando cestinare sposta davvero la mail, «in arrivo → INBOX» non basta
 * più: una mail cestinata sta nel Cestino della casella, e cercarla in INBOX
 * non la trova. Senza questo, aprire una mail dal Cestino avrebbe perso
 * impaginato e allegati — un danno introdotto da noi.
 */
export function cartellaDiMessaggio(
  m: { direzione: string; cestinato: boolean },
  account: { cartella: string; cartellaInviata: string | null; cartellaCestino: string | null }
): string | undefined {
  if (m.cestinato && account.cartellaCestino) return account.cartellaCestino
  return m.direzione === 'uscita' ? account.cartellaInviata || undefined : account.cartella
}

/** Il lavoro vero, separato per poterlo chiamare anche fuori da `after()`. */
export async function allineaCestinoOra(
  utenteId: string,
  ids: string[],
  verso: 'cestino' | 'inbox'
): Promise<number> {
  const mail = await db.messaggio.findMany({
    where: { id: { in: ids }, utenteId },
    select: { uid: true, messageId: true, direzione: true, accountId: true },
  })

  // Raggruppate per casella: una connessione per casella, non per mail.
  const perAccount = new Map<string, { uid: number; messageId: string | null; direzione: string }[]>()
  for (const m of mail) {
    if (m.uid <= 0 && !m.messageId) continue
    const g = perAccount.get(m.accountId) ?? []
    g.push({ uid: m.uid, messageId: m.messageId, direzione: m.direzione })
    perAccount.set(m.accountId, g)
  }

  let spostate = 0
  for (const [accountId, righe] of perAccount) {
    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) continue

    // La cartella Cestino si scopre da sola la prima volta e si tiene: è una
    // LIST sul server, non va rifatta a ogni mail cestinata.
    let cestino = account.cartellaCestino
    if (!cestino) {
      cestino = await trovaCartellaCestino(account)
      if (cestino) {
        await db.account.update({ where: { id: accountId }, data: { cartellaCestino: cestino } })
      }
    }
    // Nessuna cartella Cestino sulla casella: non si sposta niente. Spostare
    // «da qualche parte» sarebbe peggio di lasciare la mail dov'è.
    if (!cestino) continue

    // Gli inviati stanno nella loro cartella, la posta in arrivo in INBOX:
    // recuperando, ognuno torna a casa sua.
    const gruppi: { normale: string; righe: typeof righe }[] = [
      { normale: account.cartella, righe: righe.filter((r) => r.direzione !== 'uscita') },
      {
        normale: account.cartellaInviata || account.cartella,
        righe: righe.filter((r) => r.direzione === 'uscita'),
      },
    ]

    for (const g of gruppi) {
      if (g.righe.length === 0) continue
      const da = verso === 'cestino' ? g.normale : cestino
      const a = verso === 'cestino' ? cestino : g.normale
      spostate += await spostaSulServer(account, da, a, g.righe)
    }
  }
  return spostate
}
