import { after } from 'next/server'
import type { Account } from '@prisma/client'
import { db } from './db'
import { spostaSulServer, trovaCartellaCestino, trovaCartellaSpam } from './imap'

/**
 * FAR SEGUIRE AL SERVER quello che fai qui: cestino e SPAM.
 *
 * Fino al 5/08/2026 cestinare e segnare come spam erano fatti solo di AI Mail:
 * la mail spariva da qui e restava intatta nella INBOX della casella. Aprendo
 * la posta dal telefono o dalla webmail te la ritrovavi lì, e la casella non si
 * sgonfiava mai (solo «svuota cestino» toccava il server, cancellando).
 *
 * Ora cestinare **sposta** la mail nel Cestino della casella, segnarla come
 * spam la sposta nella Posta indesiderata, e tornare indietro («Recupera»,
 * «Non è spam») la riporta al suo posto.
 *
 * ⚠️ Si SPOSTA, non si cancella: è reversibile, ed è la ragione per cui questo
 * può girare da solo senza chiedere niente, mentre svuotare il cestino resta
 * un'azione dichiarata (quella cancella per sempre).
 * ⚠️ Gira in `after()`: è una connessione IMAP per giro, e cestinarne dieci di
 * fila non deve far aspettare nessuno. Se fallisce, **quello che vedi in AI
 * Mail resta quello buono**: la mail è comunque fuori dai piedi qui, e al
 * massimo il server non è allineato — mai il contrario.
 * ⚠️ Le copie senza riscontro sul server (`uid <= 0` e senza Message-ID) si
 * saltano: non c'è niente da spostare.
 */
export type Posto = 'normale' | 'cestino' | 'spam'

/**
 * ⚠️ `da` lo dice CHI CHIAMA, e non è pignoleria: quando questo codice gira, il
 * database è già aggiornato — una mail appena tolta dallo SPAM risulta «in
 * posta normale», quindi da qui non si può più sapere da dove veniva. Se il
 * mittente della richiesta sbaglia cartella di partenza, la mail sul server non
 * si trova e resta dov'è (in AI Mail è comunque a posto).
 */
export function allineaCartellaDopo(
  utenteId: string,
  ids: string[],
  da: Posto,
  a: Posto
): void {
  if (ids.length === 0 || da === a) return
  after(async () => {
    try {
      await allineaCartellaOra(utenteId, ids, da, a)
    } catch {
      /* il server non ha seguito: qui la mail è già a posto e non c'è niente da
         annullare. Resta al più un disallineamento visibile dalla webmail. */
    }
  })
}

/**
 * In quale cartella della casella sta ORA questa mail: serve a chi va sul
 * server a riprendere qualcosa (impaginato HTML, allegati, download).
 *
 * ⚠️ Da quando cestino e spam spostano davvero la mail, «in arrivo → INBOX» non
 * basta più: una cestinata sta nel Cestino della casella e una segnata come
 * spam nella Posta indesiderata. Senza questo, aprire una mail dal Cestino o
 * dallo SPAM avrebbe perso impaginato e allegati — un danno introdotto da noi.
 */
export function cartellaDiMessaggio(
  m: { direzione: string; cestinato: boolean; sezione?: { nome: string } | null },
  account: {
    cartella: string
    cartellaInviata: string | null
    cartellaCestino: string | null
    cartellaSpam: string | null
  }
): string | undefined {
  if (m.cestinato && account.cartellaCestino) return account.cartellaCestino
  if (m.sezione?.nome === 'SPAM' && account.cartellaSpam) return account.cartellaSpam
  return m.direzione === 'uscita' ? account.cartellaInviata || undefined : account.cartella
}

/**
 * La cartella speciale della casella, scoperta da sola la prima volta e poi
 * tenuta: è una LIST sul server, non va rifatta a ogni mail.
 */
async function cartellaSpeciale(account: Account, posto: 'cestino' | 'spam'): Promise<string | null> {
  const gia = posto === 'cestino' ? account.cartellaCestino : account.cartellaSpam
  if (gia) return gia
  const trovata = posto === 'cestino' ? await trovaCartellaCestino(account) : await trovaCartellaSpam(account)
  if (trovata) {
    await db.account.update({
      where: { id: account.id },
      data: posto === 'cestino' ? { cartellaCestino: trovata } : { cartellaSpam: trovata },
    })
  }
  return trovata
}

/** Il lavoro vero, separato per poterlo chiamare anche fuori da `after()`. */
export async function allineaCartellaOra(
  utenteId: string,
  ids: string[],
  da: Posto,
  a: Posto
): Promise<number> {
  if (da === a) return 0
  const mail = await db.messaggio.findMany({
    where: { id: { in: ids }, utenteId },
    select: { uid: true, messageId: true, direzione: true, accountId: true },
  })

  // Raggruppate per casella: una connessione per casella, non per mail.
  const perAccount = new Map<string, typeof mail>()
  for (const m of mail) {
    if (m.uid <= 0 && !m.messageId) continue
    const g = perAccount.get(m.accountId) ?? []
    g.push(m)
    perAccount.set(m.accountId, g)
  }

  let spostate = 0
  for (const [accountId, righe] of perAccount) {
    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) continue

    const speciali: Record<'cestino' | 'spam', string | null> = { cestino: null, spam: null }
    for (const posto of [da, a]) {
      if (posto !== 'normale') speciali[posto] = await cartellaSpeciale(account, posto)
    }
    // Manca la cartella dedicata sulla casella: non si sposta niente. Mandare
    // una mail «da qualche parte» è peggio che lasciarla dov'è.
    if ((da !== 'normale' && !speciali[da]) || (a !== 'normale' && !speciali[a])) continue

    // «Normale» non è una cartella sola: la posta in arrivo sta in INBOX, gli
    // inviati nella loro. Si spezza in due gruppi solo quando serve davvero.
    const inArrivo = righe.filter((m) => m.direzione !== 'uscita')
    const inviati = righe.filter((m) => m.direzione === 'uscita')
    const normaleDi = (uscita: boolean) =>
      uscita ? account.cartellaInviata || account.cartella : account.cartella

    for (const [gruppo, uscita] of [
      [inArrivo, false],
      [inviati, true],
    ] as const) {
      if (gruppo.length === 0) continue
      const partenza = da === 'normale' ? normaleDi(uscita) : speciali[da]!
      const arrivo = a === 'normale' ? normaleDi(uscita) : speciali[a]!
      spostate += await spostaSulServer(
        account,
        partenza,
        arrivo,
        gruppo.map((m) => ({ uid: m.uid, messageId: m.messageId }))
      )
    }
  }
  return spostate
}
