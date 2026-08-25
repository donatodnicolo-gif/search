// Prova del filo di domande e risposte di un reclamo, e dei soldi dell'ordine.
//
// ⚠️ Scrive sul DATABASE VERO, perché è l'unico modo di provare che la tabella
// nuova esiste davvero in produzione. Cancella SOLO le righe che ha creato lui
// (per id), mai un `deleteMany` largo: il Postgres è condiviso con le altre app.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { soldiOrdineDaOrders } from '../src/lib/orders'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

// Il reclamo su cui provare: quello indicato dall'utente, o il più recente.
const RECLAMO = process.argv[2] || (await db.reclamo.findFirst({ orderBy: { creatoIl: 'desc' } }))?.id
if (!RECLAMO) {
  console.log('Nessun reclamo in tabella: niente da provare.')
  process.exit(0)
}
const reclamo = await db.reclamo.findUnique({ where: { id: RECLAMO } })
prova('il reclamo esiste', !!reclamo, RECLAMO)
if (!reclamo) process.exit(1)
console.log(`   ${reclamo.ordineNumero || '(senza ordine)'} · ${reclamo.casistica} · ${reclamo.clienteNome}\n`)

const miei: string[] = []
/** Le domande aperte, contate come le conta la rotta. */
async function senzaRisposta(): Promise<number> {
  const m = await db.messaggioReclamo.findMany({ where: { reclamoId: RECLAMO } })
  const risposte = new Set(m.map((x) => x.rispostaA).filter(Boolean))
  return m.filter((x) => x.domanda && !risposte.has(x.id)).length
}

try {
  const partenza = await senzaRisposta()
  console.log(`domande aperte prima della prova: ${partenza}`)

  // ── 1. Una domanda resta aperta finché non le si risponde ──
  const domanda = await db.messaggioReclamo.create({
    data: {
      reclamoId: RECLAMO,
      autoreNome: 'prova automatica',
      testo: 'PROVA — il fioraio ha la prova di consegna?',
      domanda: true,
    },
  })
  miei.push(domanda.id)
  prova('una domanda nuova risulta aperta', (await senzaRisposta()) === partenza + 1)

  // ── 2. Una riga qualsiasi del filo NON è una risposta ──
  const nota = await db.messaggioReclamo.create({
    data: { reclamoId: RECLAMO, autoreNome: 'prova automatica', testo: 'PROVA — nota nel filo' },
  })
  miei.push(nota.id)
  prova(
    'una nota nel filo non chiude la domanda',
    (await senzaRisposta()) === partenza + 1,
    'scrivere qualcosa non è rispondere'
  )

  // ── 3. La risposta la chiude ──
  const risposta = await db.messaggioReclamo.create({
    data: {
      reclamoId: RECLAMO,
      autoreNome: 'prova automatica',
      testo: 'PROVA — sì, foto ricevuta',
      rispostaA: domanda.id,
    },
  })
  miei.push(risposta.id)
  prova('rispondendo, la domanda si chiude', (await senzaRisposta()) === partenza)

  // ── 4. ⚠️ Una «domanda» che è anche una risposta non esiste ──
  //    (la rotta lo impedisce: `domanda: Boolean(c.domanda) && !rispostaA`)
  prova(
    'una risposta non può essere anche una domanda aperta',
    !(await db.messaggioReclamo.findMany({ where: { reclamoId: RECLAMO, domanda: true, NOT: { rispostaA: '' } } })).length
  )

  // ── 5. I soldi dell'ordine, letti DA ORDERS ──
  console.log('\n══ I SOLDI DELL ORDINE (letti da Deluxy Orders) ══')
  if (!reclamo.ordineNumero) {
    console.log('   il reclamo non ha un numero d ordine: niente da chiedere')
  } else {
    const nostro = reclamo.ordineId
      ? await db.ordine.findUnique({ where: { id: reclamo.ordineId }, select: { shopifyId: true, totale: true } })
      : null
    const soldi = await soldiOrdineDaOrders(reclamo.ordineNumero, nostro?.shopifyId ?? '')
    if (!soldi) {
      console.log('   Orders non ha risposto (o non conosce l ordine): la scheda dirà così, non «0 €»')
    } else {
      console.log(`   totale ${soldi.totale} · al fornitore ${soldi.costo ?? 'non indicato'} · margine ${soldi.margine ?? 'non calcolabile'} (${soldi.fornitore || 'fornitore ignoto'})`)
      // ⚠️⚠️ La prova che conta: il margine NON è «totale − costo» rifatto qui.
      // È al netto IVA e lo calcola Orders: se un giorno tornasse uguale alla
      // differenza lorda, vorrebbe dire che qualcuno l'ha rifatto in casa.
      if (soldi.costo !== null && soldi.margine !== null) {
        const lordo = soldi.totale - soldi.costo
        prova(
          'il margine di Orders NON è la differenza lorda (è al netto IVA)',
          Math.abs(soldi.margine - lordo) > 0.01,
          `Orders ${soldi.margine} · lordo ${lordo}`
        )
      } else {
        console.log('   (costo o margine mancanti: il confronto non si può fare, e si dice)')
      }
    }
  }
} finally {
  // ⚠️ Solo le righe di questa prova, una per una.
  for (const id of miei) await db.messaggioReclamo.delete({ where: { id } })
  console.log(`\nripulite ${miei.length} righe di prova`)
  const rimaste = await db.messaggioReclamo.count({ where: { reclamoId: RECLAMO } })
  console.log(`messaggi rimasti su questo reclamo: ${rimaste}`)
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
