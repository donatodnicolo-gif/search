// Prova la pagina «Operatori» contro il database vero, senza passare dal browser.
//   npx tsx scripts/prova-operatori.mts
//
// Serve a due cose:
// 1. che le query girino davvero (i groupBy di Prisma falliscono a runtime, non
//    in compilazione: un `by` sbagliato passa il typecheck e si schianta in
//    produzione);
// 2. che i numeri di un periodo LUNGO tornino con quelli contati a mano su
//    tutta la tabella — se il filtro sulle date fosse rotto, i due conti
//    resterebbero uguali solo per caso.
//
// ⚠️ Sola lettura: qui non si scrive niente.
import { misuraOperatori } from '../src/lib/operatori'
import { db } from '../src/lib/db'
import { CHIUSURA } from '../src/lib/gestione'

function mezzanotte(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const ora = new Date()
const oggi = mezzanotte(ora)
const giorni = (n: number) => new Date(oggi.getTime() + n * 86400000)

const periodi: [string, Date, Date][] = [
  ['oggi', oggi, ora],
  ['ieri', giorni(-1), oggi],
  ['7 giorni', giorni(-6), ora],
  ['questo mese', new Date(ora.getFullYear(), ora.getMonth(), 1), ora],
  ['30 giorni', giorni(-29), ora],
  ['trimestre', new Date(ora.getFullYear(), Math.floor(ora.getMonth() / 3) * 3, 1), ora],
  ['anno', new Date(ora.getFullYear(), 0, 1), ora],
  ['dal 1 al 15 agosto', new Date('2026-08-01T00:00:00'), new Date('2026-08-16T00:00:00')],
]

let falliti = 0

for (const [nome, da, a] of periodi) {
  const e = await misuraOperatori(da, a)
  const somma = (k: 'ordiniPresi' | 'ordiniChiusi' | 'chatPrese' | 'chatRisposte' | 'messaggiInviati' | 'linkPagamento') =>
    e.righe.reduce((s, r) => s + r[k], 0)
  console.log(
    `\n── ${nome} (${da.toLocaleDateString('it-IT')} → ${a.toLocaleDateString('it-IT')}) — ${e.righe.length} persone`
  )
  for (const r of e.righe) {
    console.log(
      `   ${r.nome.padEnd(24)} presi ${String(r.ordiniPresi).padStart(4)} · chiusi ${String(r.ordiniChiusi).padStart(4)} · chat ${String(r.chatPrese).padStart(4)} · risposte ${String(r.chatRisposte).padStart(4)} · messaggi ${String(r.messaggiInviati).padStart(5)} · link ${String(r.linkPagamento).padStart(3)}`
    )
  }
  console.log(
    `   TOTALE                   presi ${String(somma('ordiniPresi')).padStart(4)} · chiusi ${String(somma('ordiniChiusi')).padStart(4)} · chat ${String(somma('chatPrese')).padStart(4)} · risposte ${String(somma('chatRisposte')).padStart(4)} · messaggi ${String(somma('messaggiInviati')).padStart(5)} · link ${String(somma('linkPagamento')).padStart(3)}`
  )
}

// ── Il controllo vero: un periodo che copre tutto deve dare gli stessi numeri
// di un conteggio senza filtro sulle date. ⚠️ Con l'intervallo sbagliato i
// numeri restano plausibili: è per questo che si confrontano, invece di
// guardarli e dire «sembrano giusti».
console.log('\n── Controllo: «da sempre» contro il conteggio senza filtri ──')
const sempre = await misuraOperatori(new Date('2000-01-01T00:00:00Z'), new Date(Date.now() + 86400000))
const attesi = {
  ordiniPresi: await db.ordine.count({ where: { presaDaId: { not: '' }, presaIl: { not: null } } }),
  ordiniChiusi: await db.ordine.count({
    where: { gestioneDaId: { not: '' }, gestione: CHIUSURA, gestioneIl: { not: null } },
  }),
  chatPrese: await db.conversazione.count({
    where: { presaDaId: { not: '' }, presaIl: { not: null } },
  }),
  messaggiInviati: await db.messaggio.count({
    where: { direzione: 'out', utenteId: { not: '' } },
  }),
  linkPagamento: await db.ordineCreato.count({
    where: { utenteId: { not: '' }, pagamento: 'link' },
  }),
}
for (const [k, atteso] of Object.entries(attesi) as [keyof typeof attesi, number][]) {
  const avuto = sempre.righe.reduce((s, r) => s + r[k], 0)
  const ok = avuto === atteso
  if (!ok) falliti++
  console.log(`   ${ok ? 'OK  ' : 'NO  '} ${k.padEnd(16)} pagina ${avuto} · tabella ${atteso}`)
}

console.log(
  falliti === 0 ? '\nI conti tornano.' : `\n${falliti} MISURE NON TORNANO: la pagina mente.`
)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
