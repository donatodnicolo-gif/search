// Prova le tre cose aggiunte dopo la correzione dell'utente («non e detto che
// un bonifico parti da transactions»):
//  1. DA DOVE esce il denaro — e che vuoto resti «non indicato»;
//  2. l'AVVISO al fornitore, che dice «disposto» e non «arrivato»;
//  3. «in pagamento» automatico, che pero NON deve far tornare indietro un
//     ordine gia piu avanti.
//   npx tsx scripts/prova-pagamento-fatto.mts
import { db } from '../src/lib/db'
import { calcolaMargine, pct } from '../src/lib/margine'
import { messaggioPagato, nomeUscita } from '../src/lib/metodo-pagamento'

let falliti = 0
const v = (n: string, ok: boolean, d = '') => { if (!ok) falliti++; console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`) }

console.log('\n── Da dove esce il denaro ──')
v('vuoto = «non indicato», non si indovina', nomeUscita('') === 'non indicato')
v('banca', nomeUscita('banca').includes('portale'))
v('compensazione', nomeUscita('compensazione').includes('deve'))

console.log('\n── L’avviso al fornitore ──')
const m = messaggioPagato({ chi: 'Pasticceria Rossi', importo: 130.5, ordine: '#2785', quando: new Date('2026-08-24') })
v('dice DISPOSTO, non «arrivato»', m.includes('disposto') && !m.toLowerCase().includes('arrivato'))
v('porta importo e ordine', m.includes('130,50') && m.includes('#2785'))
v('avverte che ci vogliono giorni', m.includes('giorno lavorativo'))
console.log('   ' + m.split('\n').slice(2, 3).join(' '))

console.log('\n── «In pagamento» automatico ──')
const o = await db.ordine.findFirst({ where: { gestione: 'da_gestire', numero: { not: '' } } })
if (!o) console.log('   nessun ordine «da gestire»: non si prova')
else {
  const prima = o.gestione
  await db.ordine.updateMany({
    where: { numero: o.numero, gestione: { in: ['da_gestire', 'ricerca_fornitore', 'comunicazione'] } },
    data: { gestione: 'in_pagamento' },
  })
  const dopo = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  v(`${o.numero}: passa a «in pagamento»`, dopo.gestione === 'in_pagamento')
  // ⚠️ E NON deve tornare indietro da uno stato piu' avanti.
  await db.ordine.update({ where: { id: o.id }, data: { gestione: 'gestito' } })
  await db.ordine.updateMany({
    where: { numero: o.numero, gestione: { in: ['da_gestire', 'ricerca_fornitore', 'comunicazione'] } },
    data: { gestione: 'in_pagamento' },
  })
  const chiuso = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  v('un ordine GESTITO non torna indietro a «in pagamento»', chiuso.gestione === 'gestito')
  await db.ordine.update({ where: { id: o.id }, data: { gestione: prima } })
  const tornato = await db.ordine.findUniqueOrThrow({ where: { id: o.id } })
  v('rimesso com’era', tornato.gestione === prima)
}

console.log('\n── Il margine in tabella, sui dati veri ──')
const righe = await db.richiestaPagamento.findMany({ take: 10, orderBy: { creatoIl: 'desc' } })
const numeri = [...new Set(righe.map((r) => r.ordineNumero).filter(Boolean))]
const ordini = numeri.length ? await db.ordine.findMany({ where: { numero: { in: numeri } }, select: { numero: true, totale: true } }) : []
const val = new Map<string, number>()
for (const x of ordini) val.set(x.numero, Math.max(val.get(x.numero) ?? 0, x.totale ?? 0))
let conMargine = 0
for (const r of righe) {
  const mm = calcolaMargine(val.get(r.ordineNumero) ?? 0, r.importo, 60)
  if (mm) conMargine++
  console.log(`   ${(r.ordineNumero || '—').padEnd(8)} ${String(r.importo).padStart(7)} su ${String(val.get(r.ordineNumero) ?? 0).padStart(7)} → ${mm ? pct(mm.marginePct) + ' ' + mm.verdetto : 'non calcolabile'}`)
}
console.log(`   ${conMargine} righe su ${righe.length} hanno il margine calcolabile`)

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
