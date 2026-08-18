// SPOSTA IL DATABASE DI AI MAIL da un Postgres a un altro (es. da un progetto
// Supabase pieno a uno nuovo). Copia e basta: dalla sorgente non cancella nulla.
//
//   node --env-file=.env.sposta scripts/sposta-database.mjs           # prova a vuoto
//   node --env-file=.env.sposta scripts/sposta-database.mjs --scrivi  # copia davvero
//
// In `.env.sposta` (NON committarlo — è già coperto da .gitignore per i .env):
//   DA_DATABASE_URL="postgres://…vecchio…"   # sorgente, letta e basta
//   A_DATABASE_URL="postgres://…nuovo…"      # destinazione
//
// Prima di lanciarlo, sulla DESTINAZIONE vanno create le tabelle:
//   DATABASE_URL="…nuovo…" DIRECT_URL="…nuovo…" npx prisma db push
//
// ⚠️ TRE SCELTE, E IL PERCHÉ.
//
// 1. **Non si cancella niente dalla sorgente.** Finché il vecchio database
//    esiste intatto, un errore qui è recuperabile; se invece si svuotasse man
//    mano, un intoppo a metà lascerebbe i dati divisi in due e nessuno dei due
//    completo. Il vecchio si spegne DOPO, a mano, quando il nuovo ha dimostrato
//    di funzionare.
// 2. **`skipDuplicates`, quindi si può rilanciare.** Una copia di decine di
//    migliaia di righe su una rete che può cadere deve poter riprendere: al
//    secondo giro le righe già copiate vengono saltate invece di far esplodere
//    tutto sulle chiavi.
// 3. **L'elenco delle tabelle è scritto a mano, e lo script si RIFIUTA di
//    partire se nello schema ce n'è una che non è in elenco.** Aggiungendo un
//    modello a `schema.prisma` e dimenticandolo qui, una copia «riuscita»
//    lascerebbe indietro una tabella intera senza dire niente: è il tipo di
//    guasto che ci si accorge mesi dopo. Meglio un errore rumoroso subito.

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const SCRIVI = process.argv.includes('--scrivi')
const LOTTO = 500

// Ordine di copia: prima chi viene riferito, poi chi riferisce. Le chiavi
// esterne non perdonano l'ordine sbagliato.
const ORDINE = [
  'utente',
  'account',
  'sezione', // ha un genitoreId verso sé stessa: vedi `copiaSezioni`
  'regola',
  'sequenza',
  'sequenzaPasso',
  'sequenzaIscrizione',
  'pushIscrizione',
  'contattoAI',
  'aliasContatto',
  'regolaApp',
  'reneMemoria',
  'reneAnalisi',
  'reneProposta',
  'reneConseguenza',
  'impostazione',
  'allegatoCaricato',
  'threadAI',
  'threadChiuso',
  'nomeThread',
  'istruzioneThread',
  'riassuntoThread',
  'riassuntoContatto',
  'riassuntoSezione',
  'messaggio', // dopo account e sezione
  'evento', // può puntare a un messaggio
  'attivita',
  'bozza',
  'rapportoAI',
  'propostaArchivio',
  'invioApp',
]

/** I modelli dichiarati nello schema, in minuscolo come li chiama il client. */
function modelliDelloSchema() {
  const testo = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  return [...testo.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1].charAt(0).toLowerCase() + m[1].slice(1))
}

function verificaElenco() {
  const schema = modelliDelloSchema()
  const mancanti = schema.filter((m) => !ORDINE.includes(m))
  const inPiu = ORDINE.filter((m) => !schema.includes(m))
  if (mancanti.length) {
    throw new Error(
      `Tabelle nello schema ma NON nell'elenco di copia: ${mancanti.join(', ')}.\n` +
        "Aggiungile a ORDINE (nel punto giusto rispetto alle chiavi esterne) prima di spostare: altrimenti resterebbero indietro senza che nessuno se ne accorga."
    )
  }
  if (inPiu.length) throw new Error(`Nell'elenco ci sono tabelle che lo schema non ha più: ${inPiu.join(', ')}.`)
  console.log(`Elenco tabelle verificato: ${schema.length} modelli, nessuno dimenticato.`)
}

const url = (nome) => {
  const v = (process.env[nome] || '').trim()
  if (!v) throw new Error(`Manca ${nome} (mettila in .env.sposta e lancia con --env-file=.env.sposta).`)
  // ⚠️ Il pooler di Supabase sulla 6543 è pgbouncer in modalità transaction:
  // le prepared statements di Prisma non sopravvivono fra una transazione e
  // l'altra e si rompono con «prepared statement "s0" already exists».
  // `pgbouncer=true` dice a Prisma di non usarle.
  if (!v.includes('pgbouncer=')) return v + (v.includes('?') ? '&' : '?') + 'pgbouncer=true'
  return v
}

// La chiave con cui ordinare i lotti: quasi tutte le tabelle hanno `id`,
// Impostazione ha `chiave` come chiave primaria.
const CHIAVE_ORDINE = { impostazione: 'chiave' }

// Lotti più piccoli per le tabelle con righe pesanti: 500 messaggi coi corpi
// dentro sono decine di MB per chiamata, e il pooler li rifiuta o rallenta.
// ⚠️ 18/08/2026: con lotti da 100 la sorgente ha CHIUSO la connessione a
// meta' copia ('Server has closed the connection'). In quelle 100 righe finivano
// mail con 20 MB di HTML l'una: la risposta era di centinaia di MB. Si regola
// con LOTTO_MESSAGGI senza toccare il codice.
const LOTTO_PER_MODELLO = { messaggio: Number(process.env.LOTTO_MESSAGGI) || 100 }

// I 30 giorni della finestra "calda" dell'HTML (stessa regola di htmlServer.ts).
// ⚠️ Quanti giorni di HTML ci si porta dietro. Di norma sono i 30 della
// finestra calda, ma un trasloco NON deve trascinarsi una cache: l'HTML delle
// mail ancora sul server (uid > 0) l'app se lo riprende all'apertura. Con
// GIORNI_HTML_COPIA=7 il trasloco del 18/08 e' passato da ~1 GB a ~90 MB.
const GIORNI_HTML = Number(process.env.GIORNI_HTML_COPIA) || 30
const LIMITE_HTML = new Date(Date.now() - GIORNI_HTML * 24 * 60 * 60 * 1000)

async function copiaTabella(da, a, modello, opzioni = {}) {
  const { dove = undefined, dopoLettura = null, etichetta = modello } = opzioni
  const totale = await da[modello].count({ where: dove })
  if (totale === 0) return { modello: etichetta, letti: 0, scritti: 0 }

  const lotto = LOTTO_PER_MODELLO[modello] ?? LOTTO
  const ordine = CHIAVE_ORDINE[modello] ?? 'id'

  let scritti = 0
  let saltati = 0
  for (let salta = 0; salta < totale; salta += lotto) {
    const righe = await da[modello].findMany({
      where: dove,
      skip: salta,
      take: lotto,
      orderBy: { [ordine]: 'asc' },
      ...(opzioni.omit ? { omit: opzioni.omit } : {}),
    })
    if (!SCRIVI) continue
    const dati = dopoLettura ? righe.map(dopoLettura) : righe
    const r = await a[modello].createMany({ data: dati, skipDuplicates: true })
    scritti += r.count
    saltati += righe.length - r.count
    process.stdout.write(`\r  ${etichetta}: ${Math.min(salta + lotto, totale)}/${totale}`)
  }
  if (SCRIVI) process.stdout.write('\n')
  return { modello: etichetta, letti: totale, scritti, saltati }
}

/**
 * ⚠️ I MESSAGGI SI COPIANO IN TRE GRUPPI, e il perché è il 90% del peso del
 * database: i corpi HTML. Quelli delle mail vecchie NON vanno copiati — sul
 * database nuovo li toglierebbe comunque la pulizia del cron, e l'app li
 * riprende dal server all'apertura. Ma non basta non SCRIVERLI: bisogna non
 * LEGGERLI proprio (`omit` in query), altrimenti la copia scaricherebbe lo
 * stesso 1,4 GB dalla sorgente — che è già oltre il tetto di egress del piano
 * Free — per poi buttarlo.
 *
 *  1. mail RECENTI (finestra calda): intere, HTML compreso;
 *  2. mail VECCHIE ancora sul server (uid > 0): senza HTML, mai letto;
 *  3. mail VECCHIE solo-locali (uid ≤ 0): intere — per loro il database è
 *     l'unico posto al mondo dove l'impaginato esiste.
 */
async function copiaMessaggi(da, a) {
  const esiti = []
  esiti.push(
    await copiaTabella(da, a, 'messaggio', {
      dove: { data: { gte: LIMITE_HTML } },
      etichetta: 'messaggio (recenti, con HTML)',
    })
  )
  esiti.push(
    await copiaTabella(da, a, 'messaggio', {
      dove: { data: { lt: LIMITE_HTML }, uid: { gt: 0 } },
      omit: { corpoHtml: true },
      dopoLettura: (r) => ({ ...r, corpoHtml: null }),
      etichetta: 'messaggio (vecchi, HTML dal server)',
    })
  )
  esiti.push(
    await copiaTabella(da, a, 'messaggio', {
      dove: { data: { lt: LIMITE_HTML }, uid: { lte: 0 } },
      etichetta: 'messaggio (vecchi solo-locali)',
    })
  )
  // Un solo esito riassuntivo: il confronto finale conta la tabella intera.
  return {
    modello: 'messaggio',
    letti: esiti.reduce((s, e) => s + e.letti, 0),
    scritti: esiti.reduce((s, e) => s + (e.scritti ?? 0), 0),
    saltati: esiti.reduce((s, e) => s + (e.saltati ?? 0), 0),
  }
}

/**
 * Le sezioni possono avere una sezione MADRE (`genitoreId`): copiate in ordine
 * qualsiasi, una figlia inserita prima della madre viola la chiave esterna. Si
 * copiano quindi in due passi — prima tutte senza legame, poi si riattaccano.
 */
async function copiaSezioni(da, a) {
  const righe = await da.sezione.findMany()
  if (righe.length === 0) return { modello: 'sezione', letti: 0, scritti: 0 }
  if (!SCRIVI) return { modello: 'sezione', letti: righe.length, scritti: 0 }
  const r = await a.sezione.createMany({
    data: righe.map((s) => ({ ...s, genitoreId: null })),
    skipDuplicates: true,
  })
  for (const s of righe.filter((x) => x.genitoreId)) {
    await a.sezione.update({ where: { id: s.id }, data: { genitoreId: s.genitoreId } }).catch(() => {})
  }
  return { modello: 'sezione', letti: righe.length, scritti: r.count }
}

/**
 * Controlli PRIMA di toccare qualsiasi cosa.
 *
 * ⚠️ IL PERICOLO VERO NON È LA COPIA, È IL `prisma db push` CHE LA PRECEDE.
 * `db push` fa combaciare il database con lo schema: se la destinazione ospita
 * già un'ALTRA applicazione nello stesso schema `public`, Prisma vede 41
 * tabelle che nel nostro schema non esistono e propone di **cancellarle**. Si
 * ferma da solo — a meno che qualcuno, stufo dell'errore, non aggiunga
 * `--accept-data-loss`. A quel punto l'altra applicazione non c'è più.
 *
 * La difesa è semplice e definitiva: AI Mail va in uno **schema suo**
 * (`?schema=mail` nella stringa di connessione). Prisma vede solo quello, e
 * `public` con l'altra app gli resta invisibile — non può toccarla nemmeno
 * volendo. È anche come stanno già le otto app sul cluster condiviso Deluxy.
 */
async function controlliPreliminari(da, a, urlDestinazione) {
  const schemaDichiarato = /[?&]schema=([^&]+)/.exec(urlDestinazione)?.[1] ?? null

  const [pesoDa] = await da.$queryRawUnsafe(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS d`
  )
  const [pesoA] = await a.$queryRawUnsafe(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS d`
  )
  const [roA] = await a.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS ro`)
  const estranee = await a.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )

  console.log(`\nSorgente:      occupa ${pesoDa.d}`)
  console.log(`Destinazione:  occupa ${pesoA.d}${roA.ro === 'on' ? '  ⚠️ È IN SOLA LETTURA' : ''}`)
  console.log(`Schema di destinazione: ${schemaDichiarato ?? 'public (nessuno dichiarato)'}`)

  if (roA.ro === 'on') {
    throw new Error('La destinazione è in sola lettura: non ci si può copiare niente. Liberare spazio o alzare il piano.')
  }

  const nostre = new Set(modelliDelloSchema().map((m) => m.charAt(0).toUpperCase() + m.slice(1)))
  const altrui = estranee.map((t) => t.tablename).filter((t) => !nostre.has(t))

  if (altrui.length > 0 && !schemaDichiarato) {
    throw new Error(
      `Nello schema "public" della destinazione ci sono già ${altrui.length} tabelle di un'ALTRA applicazione ` +
        `(${altrui.slice(0, 6).join(', ')}${altrui.length > 6 ? ', …' : ''}).\n\n` +
        'Copiarci sopra AI Mail senza separare gli schemi è pericoloso: il `prisma db push` che crea le\n' +
        "tabelle vedrebbe quelle dell'altra app come «da cancellare».\n\n" +
        'Rimedio: aggiungi ?schema=mail in fondo a A_DATABASE_URL (e usa lo stesso schema in DIRECT_URL\n' +
        'e poi su Vercel). Così AI Mail vive in una stanza sua e non può toccare quella accanto.'
    )
  }
  if (altrui.length > 0) {
    console.log(`Nota: in "public" c'è un'altra applicazione (${altrui.length} tabelle) — resta intoccata, noi stiamo in "${schemaDichiarato}".`)
  }
}

async function main() {
  verificaElenco()

  const urlA = url('A_DATABASE_URL')
  const da = new PrismaClient({ datasources: { db: { url: url('DA_DATABASE_URL') } } })
  const a = new PrismaClient({ datasources: { db: { url: urlA } } })

  await controlliPreliminari(da, a, urlA)

  if (!SCRIVI) {
    console.log('\n⚠️  PROVA A VUOTO: leggo e conto, non scrivo niente. Aggiungi --scrivi per copiare davvero.\n')
  }

  const esiti = []
  for (const modello of ORDINE) {
    try {
      esiti.push(
        modello === 'sezione'
          ? await copiaSezioni(da, a)
          : modello === 'messaggio'
            ? await copiaMessaggi(da, a)
            : await copiaTabella(da, a, modello)
      )
    } catch (e) {
      console.error(`\n✗ ${modello}: ${e.message}`)
      esiti.push({ modello, errore: e.message })
      // Si va avanti: sapere QUALI tabelle non passano è più utile che fermarsi
      // alla prima (tanto la sorgente non viene toccata e si può rilanciare).
    }
  }

  // VERIFICA FINALE: si contano le righe sulle due parti e si confrontano. È il
  // solo modo per dire «è andata» senza fidarsi.
  console.log('\n--- confronto finale (sorgente → destinazione) ---')
  let tutteUguali = true
  for (const { modello, errore } of esiti) {
    if (errore) {
      console.log(`  ${modello.padEnd(20)} ERRORE: ${errore.slice(0, 80)}`)
      tutteUguali = false
      continue
    }
    const [n1, n2] = await Promise.all([da[modello].count(), a[modello].count()])
    const ok = n1 === n2
    if (!ok) tutteUguali = false
    console.log(`  ${modello.padEnd(20)} ${String(n1).padStart(7)} → ${String(n2).padStart(7)}  ${ok ? '✓' : '✗'}`)
  }

  console.log(
    tutteUguali && SCRIVI
      ? '\n✓ Tutte le tabelle combaciano. Ora si può cambiare DATABASE_URL/DIRECT_URL su Vercel.\n  ⚠️ NON cancellare il vecchio database finché il nuovo non ha lavorato qualche giorno.'
      : SCRIVI
        ? '\n✗ Qualcosa non combacia: rilancia lo script (è ripetibile) e riguarda le righe con ✗.'
        : '\nProva a vuoto finita. Se i numeri di partenza tornano, rilancia con --scrivi.'
  )

  await da.$disconnect()
  await a.$disconnect()
}

main().catch((e) => {
  console.error('\n✗', e.message)
  process.exit(1)
})
