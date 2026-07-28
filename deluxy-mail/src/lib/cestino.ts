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

/**
 * Il database accetta scritture? Su Supabase, a disco pieno, passa in SOLA
 * LETTURA e ogni INSERT/DELETE fallisce con `25006`.
 */
async function databaseScrivibile(): Promise<boolean> {
  try {
    const r = await db.$queryRaw<{ ro: string }[]>`SELECT current_setting('transaction_read_only') AS ro`
    return r[0]?.ro !== 'on'
  } catch {
    return true // non si riesce a chiederlo: si prosegue come prima
  }
}

export async function svuotaCestinoDi(utenteId: string): Promise<EsitoSvuota> {
  // ⚠️ SI CONTROLLA PRIMA DI TOCCARE IL SERVER, e non è un dettaglio.
  //
  // L'ordine di questa funzione è: leggi l'elenco → cancella dalla CASELLA →
  // cancella le copie locali. A database in sola lettura i primi due passi
  // riescono benissimo e il terzo fallisce: risultato, mail cancellate PER
  // SEMPRE dal server di posta e ancora tutte qui. Il contrario di quello che
  // si voleva, e irreversibile.
  //
  // Il caso non è teorico: è successo che il database andasse in sola lettura
  // (disco pieno) proprio mentre si stava svuotando il cestino.
  if (!(await databaseScrivibile())) {
    return {
      ok: false,
      rimossi: 0,
      suServer: 0,
      messaggio:
        'Non svuoto il cestino: il database non accetta scritture (sola lettura — su Supabase succede a disco pieno). ' +
        'Procedere cancellerebbe le mail dalla casella SENZA riuscire a toglierle da qui: irreversibile e inutile. ' +
        'Libera spazio e riprova.',
    }
  }

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
