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
  return v
}

async function copiaTabella(da, a, modello) {
  const totale = await da[modello].count()
  if (totale === 0) return { modello, letti: 0, scritti: 0 }

  let scritti = 0
  let saltati = 0
  for (let salta = 0; salta < totale; salta += LOTTO) {
    const righe = await da[modello].findMany({ skip: salta, take: LOTTO, orderBy: { id: 'asc' } })
    if (!SCRIVI) continue
    const r = await a[modello].createMany({ data: righe, skipDuplicates: true })
    scritti += r.count
    saltati += righe.length - r.count
    process.stdout.write(`\r  ${modello}: ${Math.min(salta + LOTTO, totale)}/${totale}`)
  }
  if (SCRIVI) process.stdout.write('\n')
  return { modello, letti: totale, scritti, saltati }
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

async function main() {
  verificaElenco()

  const da = new PrismaClient({ datasources: { db: { url: url('DA_DATABASE_URL') } } })
  const a = new PrismaClient({ datasources: { db: { url: url('A_DATABASE_URL') } } })

  if (!SCRIVI) {
    console.log('\n⚠️  PROVA A VUOTO: leggo e conto, non scrivo niente. Aggiungi --scrivi per copiare davvero.\n')
  }

  const esiti = []
  for (const modello of ORDINE) {
    try {
      esiti.push(modello === 'sezione' ? await copiaSezioni(da, a) : await copiaTabella(da, a, modello))
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
