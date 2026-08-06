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

// ---------- Lo stato del lavoro, scritto sul server ----------
//
// ⚠️ Prima lo svuotamento viveva dentro la fetch del browser: cambiando
// schermata la richiesta moriva col componente, il lavoro si fermava a metà e
// dell'esito non restava traccia. Un lavoro lungo non può dipendere dalla
// pagina aperta. Ora la rotta lo avvia, risponde subito e lo lascia girare in
// `after()`; l'avanzamento sta QUI, in una riga di `Impostazione` per utente,
// così lo si ritrova tornando sul cestino (o da un altro dispositivo).

export type StatoSvuota = {
  stato: 'in-corso' | 'finito' | 'interrotto'
  /** Quale passo sta facendo, in italiano. */
  fase: string
  /** Mail passate in rassegna sul server e quante sono in tutto. */
  fatte: number
  totali: number
  iniziatoIl: string
  aggiornatoIl: string
  /** Solo a lavoro finito: l'esito da mostrare. */
  ok?: boolean
  messaggio?: string
}

const chiaveLavoro = (utenteId: string) => `cestino.lavoro:${utenteId}`

/** Oltre questo tempo senza un segno di vita il lavoro si considera INTERROTTO
 *  (la funzione su Vercel muore comunque a 300s: un lavoro «in corso» eterno
 *  sarebbe una bugia, e bloccherebbe il tasto per sempre). */
const SILENZIO_MAX_MS = 90_000

/** Per quanto si continua a mostrare l'esito di uno svuotamento finito. */
const ESITO_VALIDO_MS = 15 * 60_000

export async function leggiStatoSvuota(utenteId: string): Promise<StatoSvuota | null> {
  let riga: { valore: string } | null = null
  try {
    riga = await db.impostazione.findUnique({
      where: { chiave: chiaveLavoro(utenteId) },
      select: { valore: true },
    })
  } catch {
    return null
  }
  if (!riga) return null
  let s: StatoSvuota
  try {
    s = JSON.parse(riga.valore) as StatoSvuota
  } catch {
    return null
  }
  const fermoDa = Date.now() - new Date(s.aggiornatoIl).getTime()
  // Un esito vecchio non è più una notizia: scade, altrimenti al posto del
  // tasto «Svuota cestino» resterebbe per sempre il messaggio dell'ultima volta.
  if (s.stato === 'finito' && fermoDa > ESITO_VALIDO_MS) return null
  // Fermo da troppo: lo dichiaro interrotto invece di far girare una rotella
  // che non gira più. Riprendere è sicuro — si riparte da ciò che è rimasto.
  if (s.stato === 'in-corso' && fermoDa > SILENZIO_MAX_MS) {
    return {
      ...s,
      stato: 'interrotto',
      messaggio: `Interrotto dopo ${s.fatte} mail su ${s.totali}: riprendi, ricomincia da quelle rimaste.`,
    }
  }
  return s
}

async function scriviStato(utenteId: string, s: StatoSvuota) {
  const valore = JSON.stringify(s)
  try {
    await db.impostazione.upsert({
      where: { chiave: chiaveLavoro(utenteId) },
      create: { chiave: chiaveLavoro(utenteId), valore },
      update: { valore },
    })
  } catch {
    /* lo stato è per far vedere l'avanzamento: non deve fermare il lavoro */
  }
}

/**
 * Prenota lo svuotamento: scrive «in corso» e dice se si può partire. Serve a
 * non far partire due svuotamenti insieme (due connessioni IMAP che cancellano
 * le stesse mail), e a rispondere SUBITO al browser.
 */
export async function prenotaSvuotaCestino(
  utenteId: string
): Promise<{ avviato: boolean; messaggio: string }> {
  const corrente = await leggiStatoSvuota(utenteId)
  if (corrente?.stato === 'in-corso') {
    return {
      avviato: false,
      messaggio: `Sto già svuotando: ${corrente.fatte} mail su ${corrente.totali}.`,
    }
  }
  const quanti = await db.messaggio.count({ where: { cestinato: true, utenteId } })
  if (quanti === 0) return { avviato: false, messaggio: 'Il cestino è già vuoto.' }

  const ora = new Date().toISOString()
  await scriviStato(utenteId, {
    stato: 'in-corso',
    fase: 'Preparo l’elenco…',
    fatte: 0,
    totali: quanti,
    iniziatoIl: ora,
    aggiornatoIl: ora,
  })
  return { avviato: true, messaggio: `Svuotamento avviato su ${quanti} mail.` }
}

/**
 * Il lavoro vero, con lo stato aggiornato mentre gira. Va chiamato dentro
 * `after()`: la risposta al browser è già partita e questo continua anche se
 * chi l'ha lanciato cambia schermata o chiude la scheda.
 */
export async function eseguiSvuotaCestino(utenteId: string): Promise<EsitoSvuota> {
  const iniziato = (await leggiStatoSvuota(utenteId))?.iniziatoIl ?? new Date().toISOString()
  const base = { stato: 'in-corso' as const, iniziatoIl: iniziato }
  try {
    const esito = await svuotaCestinoDi(utenteId, async (fase, fatte, totali) => {
      await scriviStato(utenteId, {
        ...base,
        fase,
        fatte,
        totali,
        aggiornatoIl: new Date().toISOString(),
      })
    })
    await scriviStato(utenteId, {
      ...base,
      stato: 'finito',
      fase: 'Fatto.',
      fatte: esito.rimossi,
      totali: esito.rimossi,
      aggiornatoIl: new Date().toISOString(),
      ok: esito.ok,
      messaggio: esito.messaggio,
    })
    return esito
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : 'Errore imprevisto'
    await scriviStato(utenteId, {
      ...base,
      stato: 'finito',
      fase: 'Non riuscito.',
      fatte: 0,
      totali: 0,
      aggiornatoIl: new Date().toISOString(),
      ok: false,
      messaggio,
    })
    return { ok: false, rimossi: 0, suServer: 0, messaggio }
  }
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

/** Come si racconta l'avanzamento a chi guarda (una scrittura ogni tanto, non
 *  una per mail: il lavoro non deve rallentare per farsi vedere). */
export type Avanzamento = (fase: string, fatte: number, totali: number) => Promise<void>
const OGNI_MS = 2000

export async function svuotaCestinoDi(
  utenteId: string,
  avanzamento?: Avanzamento
): Promise<EsitoSvuota> {
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

  // L'avanzamento si conta su TUTTE le mail da cercare, non per cartella: chi
  // guarda vuole sapere a che punto è il lavoro, non a che punto è la terza
  // casella. Scritto al massimo una volta ogni due secondi.
  const totali = [...perAccount.values()].reduce((n, g) => n + g.inbox.length + g.inviata.length, 0)
  let viste = 0
  let ultimaScrittura = 0
  const segna = async (fase: string, nelGruppo: number, offset: number) => {
    viste = offset + nelGruppo
    const ora = Date.now()
    if (!avanzamento || ora - ultimaScrittura < OGNI_MS) return
    ultimaScrittura = ora
    await avanzamento(fase, viste, totali)
  }

  await avanzamento?.('Cerco le mail sulla casella…', 0, totali)
  for (const [accountId, g] of perAccount) {
    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) continue
    const fase = `Cancello sulla casella ${account.email}…`
    try {
      // ⚠️ PRIMA la cartella Cestino della casella: dal 5/08/2026 cestinare
      // SPOSTA la mail lì (vedi cartelleServer.ts), quindi è lì che sta adesso.
      // Le cartelle normali si guardano lo stesso subito dopo, per le mail
      // cestinate PRIMA di quella modifica e per quelle il cui spostamento non
      // è riuscito: una passata in più su un lavoro già lento e in sottofondo,
      // in cambio della certezza di non lasciare mail vive sul server.
      const tutte = [...g.inbox, ...g.inviata]
      if (account.cartellaCestino && tutte.length) {
        const offset = viste
        suServer += await eliminaDalServer(account, account.cartellaCestino, tutte, (n) => {
          void segna(`Cerco nel Cestino di ${account.email}…`, n, offset)
        })
      }
      if (g.inbox.length) {
        const offset = viste
        suServer += await eliminaDalServer(account, account.cartella, g.inbox, (n) => {
          void segna(fase, n, offset)
        })
        viste = offset + g.inbox.length
      }
      if (g.inviata.length && account.cartellaInviata) {
        const offset = viste
        suServer += await eliminaDalServer(account, account.cartellaInviata, g.inviata, (n) => {
          void segna(fase, n, offset)
        })
        viste = offset + g.inviata.length
      }
    } catch {
      errori.push(account.email)
    }
  }

  await avanzamento?.('Tolgo le copie da AI Mail…', totali, totali)
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
