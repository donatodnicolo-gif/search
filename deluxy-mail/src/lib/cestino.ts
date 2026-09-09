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
  /** Quante NON sono state cancellate dalla casella perché un altro utente di
   *  AI Mail ha ancora quella stessa mail nella STESSA casella condivisa. */
  lasciatePerAltri: number
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
    return { ok: false, rimossi: 0, suServer: 0, lasciatePerAltri: 0, messaggio }
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

/** La chiave con cui si riconosce «la stessa mail» fra due utenti: la CASELLA
 *  (stessa scatola sul server) più il Message-ID. Senza Message-ID si ripiega
 *  sull'UID, che dentro una casella identifica il messaggio.
 *
 *  ⚠️ La casella nella chiave non è un dettaglio: lo stesso Message-ID esiste
 *  anche in un'altra casella quando una mail arriva per conoscenza (la stessa
 *  mail sta in `cs@` e in `nicolo@`). Sono due scatole diverse: la copia in
 *  `nicolo@` non deve impedire di cancellare quella in `cs@`. */
function chiaveMail(casella: string, messageId: string | null, uid: number): string {
  return messageId ? `${casella}|mid:${messageId}` : `${casella}|uid:${uid}`
}

/**
 * Le mail che un ALTRO utente di AI Mail ha ancora nella stessa casella.
 *
 * «Ancora» comprende il suo cestino: finché la riga esiste può ripristinarla,
 * quindi la mail sul server serve ancora. Torna l'insieme delle chiavi da NON
 * cancellare dal server.
 *
 * Costa una lettura degli account (poche righe) più una query a lotti sui
 * Message-ID: niente, accanto ai giri IMAP che lo svuotamento fa comunque.
 */
async function tenuteDaAltriUtenti(
  utenteId: string,
  cestinati: { uid: number; messageId: string | null; casella: string }[]
): Promise<Set<string>> {
  const tenute = new Set<string>()
  if (cestinati.length === 0) return tenute

  // Gli account degli ALTRI utenti, raggruppati per casella. Sono una quindicina
  // in tutto: si filtra in memoria perché il confronto va fatto senza badare a
  // maiuscole e spazi, e Prisma non lo sa fare dentro un `in`.
  const altri = await db.account.findMany({
    where: { utenteId: { not: utenteId } },
    select: { id: true, email: true },
  })
  const accountAltriPerCasella = new Map<string, string[]>()
  for (const a of altri) {
    const casella = a.email.trim().toLowerCase()
    accountAltriPerCasella.set(casella, [...(accountAltriPerCasella.get(casella) ?? []), a.id])
  }
  if (accountAltriPerCasella.size === 0) return tenute

  // Solo le caselle davvero condivise: sulle altre non c'è niente da chiedere.
  const perCasella = new Map<string, { messageId: string[]; uid: number[] }>()
  for (const m of cestinati) {
    if (!accountAltriPerCasella.has(m.casella)) continue
    const g = perCasella.get(m.casella) ?? { messageId: [], uid: [] }
    if (m.messageId) g.messageId.push(m.messageId)
    else if (m.uid > 0) g.uid.push(m.uid)
    perCasella.set(m.casella, g)
  }

  const LOTTO = 500
  for (const [casella, g] of perCasella) {
    const idAltri = accountAltriPerCasella.get(casella)!
    for (let i = 0; i < g.messageId.length; i += LOTTO) {
      const fetta = g.messageId.slice(i, i + LOTTO)
      const vive = await db.messaggio.findMany({
        where: { accountId: { in: idAltri }, messageId: { in: fetta } },
        select: { messageId: true },
      })
      for (const v of vive) if (v.messageId) tenute.add(chiaveMail(casella, v.messageId, 0))
    }
    for (let i = 0; i < g.uid.length; i += LOTTO) {
      const fetta = g.uid.slice(i, i + LOTTO)
      const vive = await db.messaggio.findMany({
        where: { accountId: { in: idAltri }, uid: { in: fetta } },
        select: { uid: true },
      })
      for (const v of vive) tenute.add(chiaveMail(casella, null, v.uid))
    }
  }
  return tenute
}

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
      lasciatePerAltri: 0,
      messaggio:
        'Non svuoto il cestino: il database non accetta scritture (sola lettura — su Supabase succede a disco pieno). ' +
        'Procedere cancellerebbe le mail dalla casella SENZA riuscire a toglierle da qui: irreversibile e inutile. ' +
        'Libera spazio e riprova.',
    }
  }

  const righeCestinate = await db.messaggio.findMany({
    where: { cestinato: true, utenteId },
    // `account.email` è la CASELLA: è lei, non l'id dell'account, a dire quale
    // scatola c'è sul server — la stessa casella ha un `Account` per utente.
    select: { uid: true, messageId: true, direzione: true, accountId: true, account: { select: { email: true } } },
  })
  const cestinati = righeCestinate.map((m) => ({
    uid: m.uid,
    messageId: m.messageId,
    direzione: m.direzione,
    accountId: m.accountId,
    casella: m.account.email.trim().toLowerCase(),
  }))

  // ⚠️ UNA CASELLA PUÒ ESSERE DI PIÙ UTENTI. `cs@deluxy.it` è configurata sia
  // dall'utente «Customer Service» sia da Nicolò, `amministrazione@` da Nicolò e
  // da Renato: due righe `Account` e due copie locali, ma **una sola scatola sul
  // server**. Cancellare di là è irreversibile e vale per tutti — e chi preme
  // «Svuota cestino» non ha modo di saperlo. Misurato il 07/09/2026: in quel
  // momento c'erano **417 mail** nel cestino di uno e ancora vive per l'altro su
  // `cs@`, 34 su `amministrazione@`.
  //
  // Regola decisa dall'utente: **dal server si cancella solo quando non le ha
  // più nessuno**. Finché un altro utente ha ancora quella mail — anche solo nel
  // suo cestino, da dove può ripristinarla — qui si tolgono le copie locali e
  // basta. Non serve tenere traccia di chi ha già svuotato: quando l'ultimo
  // svuota non trova più nessuno e la cancella davvero.
  const trattenute = await tenuteDaAltriUtenti(utenteId, cestinati)

  // Cancellazione DAL SERVER (irreversibile). La posta in entrata sta nella
  // INBOX, gli inviati nella cartella "Inviata". Le copie locali senza riscontro
  // sul server (uid negativo E senza Message-ID) non hanno nulla da cancellare:
  // si saltano.
  type Rif = { uid: number; messageId: string | null }
  const perAccount = new Map<string, { inbox: Rif[]; inviata: Rif[] }>()
  let lasciatePerAltri = 0
  for (const m of cestinati) {
    if (m.uid <= 0 && !m.messageId) continue
    if (trattenute.has(chiaveMail(m.casella, m.messageId, m.uid))) {
      lasciatePerAltri++
      continue
    }
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
  // ⚠️ Le due cifre vanno tenute distinte, altrimenti sembra che l'app non abbia
  // funzionato: uno svuota il cestino, ritrova la posta sul telefono e pensa a un
  // guasto. Qui gli si dice il perché.
  const spiegazione = lasciatePerAltri
    ? ` ${lasciatePerAltri} ${lasciatePerAltri === 1 ? 'è rimasta' : 'sono rimaste'} nella casella: ${
        lasciatePerAltri === 1 ? 'ce l\'ha' : 'ce le ha'
      } ancora un altro utente di AI Mail, e dal server si cancella solo quando non ${
        lasciatePerAltri === 1 ? 'la' : 'le'
      } tiene più nessuno.`
    : ''
  return {
    ok: errori.length === 0,
    rimossi: r.count,
    suServer,
    lasciatePerAltri,
    messaggio: `Cestino svuotato: ${r.count} rimossi da AI Mail, ${suServer} cancellati anche dal server (definitivo).${spiegazione}${nota}`,
  }
}
