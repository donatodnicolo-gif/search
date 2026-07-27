import { db } from './db'
import { eliminaDalServer } from './imap'

// Svuotare il cestino: l'unica azione dell'app che cancella DAVVERO qualcosa —
// sia la copia locale sia, quando la si ritrova, la mail sul server IMAP.
//
// ⚠️ Vive qui, e non fra le Server Action, perché la chiama una ROTTA
// (`/api/svuota-cestino`). Le Server Action di Next si accodano con le
// navigazioni: finché questa girava come azione, l'app restava bloccata per
// tutto il tempo — e il tempo è tanto, vedi sotto.
//
// ⚠️ PERCHÉ È LENTA, e perché va bene che lo sia: per ogni mail si cerca il suo
// Message-ID sul server prima di cancellarla (`eliminaDalServer`). Fidarsi
// dell'UID memorizzato sarebbe molto più rapido, ma un UID vecchio può puntare a
// un'ALTRA mail — e qui si cancella per sempre. Su una cancellazione
// irreversibile la prudenza vale più della velocità: il problema da risolvere
// non era farla correre, era non far aspettare l'utente mentre corre.

export type EsitoSvuota = {
  ok: boolean
  messaggio: string
  /** Quante copie locali sono state rimosse. */
  rimossi: number
  /** Quante sono state cancellate anche dalla casella (definitivo). */
  suServer: number
}

export async function svuotaCestinoDi(utenteId: string): Promise<EsitoSvuota> {
  const cestinati = await db.messaggio.findMany({
    where: { cestinato: true, utenteId },
    select: { uid: true, messageId: true, direzione: true, accountId: true },
  })

  // Cancellazione DAL SERVER (irreversibile). La posta in entrata sta nella
  // INBOX, gli inviati nella cartella "Inviata". Le copie locali senza riscontro
  // sul server (uid negativo E senza Message-ID) non hanno nulla da cancellare:
  // si saltano.
  type Rif = { uid: number; messageId: string | null }
  const perAccount = new Map<string, { inbox: Rif[]; inviata: Rif[] }>()
  for (const m of cestinati) {
    if (m.uid <= 0 && !m.messageId) continue
    const g = perAccount.get(m.accountId) ?? { inbox: [], inviata: [] }
    const rif = { uid: m.uid, messageId: m.messageId }
    if (m.direzione === 'uscita') g.inviata.push(rif)
    else g.inbox.push(rif)
    perAccount.set(m.accountId, g)
  }

  let suServer = 0
  const errori: string[] = []
  for (const [accountId, g] of perAccount) {
    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) continue
    try {
      if (g.inbox.length) suServer += await eliminaDalServer(account, account.cartella, g.inbox)
      if (g.inviata.length && account.cartellaInviata) {
        suServer += await eliminaDalServer(account, account.cartellaInviata, g.inviata)
      }
    } catch {
      errori.push(account.email)
    }
  }

  const r = await db.messaggio.deleteMany({ where: { cestinato: true, utenteId } })
  const nota = errori.length
    ? ` Attenzione: sul server di ${errori.join(', ')} la cancellazione non è riuscita (riprova).`
    : ''
  return {
    ok: errori.length === 0,
    rimossi: r.count,
    suServer,
    messaggio: `Cestino svuotato: ${r.count} rimossi da AI Mail, ${suServer} cancellati anche dal server (definitivo).${nota}`,
  }
}
