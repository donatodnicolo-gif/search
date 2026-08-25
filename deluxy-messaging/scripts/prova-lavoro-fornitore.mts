// Prova del conto «quanto lavoro abbiamo dato a questo fornitore», sui dati veri.
//
// ⚠️⚠️ Il rischio di questo conto non è sbagliare la somma: è **dire un numero
// più basso del vero e farlo sembrare completo**. Un ordine senza costo scritto
// non vale zero — vale «non lo so» — e sommarlo come zero racconterebbe che a
// quel fornitore abbiamo dato meno di quello che gli abbiamo dato. Per questo
// gli ordini muti si contano a parte, e la prova li cerca apposta.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { lavoroPerFornitore } from '../src/lib/lavoro-fornitore'
import { chiaveNome, riassuntoLavoro } from '../src/lib/cerca-fornitore'

// ⚠️ `toLocaleString` con la valuta mette uno SPAZIO UNIFICATORE (U+00A0) fra
// numero e «€»: confrontando con uno spazio normale la prova fallisce mostrando
// due stringhe identiche a occhio. Si normalizza, e si dice perché.
const senzaNbsp = (s: string) => s.replace(/ /g, ' ')

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const lavoro = await lavoroPerFornitore()

// ── Il confronto: il conto aggregato contro gli ordini uno per uno ──
const ordini = await db.ordine.findMany({
  where: { fornitoreNome: { not: '' } },
  select: { fornitoreNome: true, fornitoreCosto: true },
})
const aMano = new Map<string, { ordini: number; costo: number; senzaCosto: number }>()
for (const o of ordini) {
  const k = chiaveNome(o.fornitoreNome)
  const v = aMano.get(k) ?? { ordini: 0, costo: 0, senzaCosto: 0 }
  v.ordini++
  if (typeof o.fornitoreCosto === 'number') v.costo += o.fornitoreCosto
  else v.senzaCosto++
  aMano.set(k, v)
}

console.log(`fornitori con almeno un ordine: ${aMano.size}`)
prova('il conto aggregato copre tutti i fornitori', lavoro.size === aMano.size, `${lavoro.size} contro ${aMano.size}`)

let differenze = 0
for (const [k, atteso] of aMano) {
  const avuto = lavoro.get(k)
  if (!avuto) { differenze++; console.log(`   manca: ${k}`); continue }
  if (avuto.ordini !== atteso.ordini || Math.abs(avuto.costo - atteso.costo) > 0.01 || avuto.senzaCosto !== atteso.senzaCosto) {
    differenze++
    console.log(`   ${k}: aggregato ${avuto.ordini}/${avuto.costo}/${avuto.senzaCosto} contro ${atteso.ordini}/${atteso.costo}/${atteso.senzaCosto}`)
  }
}
prova('nessuna differenza fornitore per fornitore', differenze === 0, `${differenze} differenze`)

const totale = [...lavoro.values()].reduce((s, v) => s + v.costo, 0)
const totaleOrdini = [...lavoro.values()].reduce((s, v) => s + v.ordini, 0)
console.log(`\ntotale: ${totaleOrdini} ordini, ${totale.toFixed(2)} € dati`)
prova('il totale non è zero (se lo fosse, il conto non starebbe leggendo niente)', totale > 0)

// ── La riga a schermo ──
console.log('\n══ COME SI LEGGE A SCHERMO ══')
prova('chi non conosciamo lo dice', riassuntoLavoro(undefined) === 'mai lavorato con lui', riassuntoLavoro(undefined))
prova('zero ordini = mai lavorato', riassuntoLavoro({ ordini: 0, costo: 0, senzaCosto: 0, ultimoIl: null }) === 'mai lavorato con lui')
prova(
  'un ordine col costo',
  senzaNbsp(riassuntoLavoro({ ordini: 1, costo: 80, senzaCosto: 0, ultimoIl: null })) === '1 ordine · 80 € dati',
  senzaNbsp(riassuntoLavoro({ ordini: 1, costo: 80, senzaCosto: 0, ultimoIl: null }))
)
// ⚠️⚠️ Il caso che conta: il totale NON deve sembrare tutto.
prova(
  'gli ordini senza costo si dicono',
  senzaNbsp(riassuntoLavoro({ ordini: 3, costo: 160, senzaCosto: 1, ultimoIl: null })) === '3 ordini · 160 € dati · 1 senza costo',
  senzaNbsp(riassuntoLavoro({ ordini: 3, costo: 160, senzaCosto: 1, ultimoIl: null }))
)
prova(
  'se non ne conosciamo NESSUN costo non si scrive «0 €»',
  riassuntoLavoro({ ordini: 2, costo: 0, senzaCosto: 2, ultimoIl: null }) === '2 ordini · costo mai scritto',
  riassuntoLavoro({ ordini: 2, costo: 0, senzaCosto: 2, ultimoIl: null })
)

console.log('\n══ I PRIMI CINQUE, DAI DATI VERI ══')
for (const [k, v] of [...lavoro.entries()].sort((a, b) => b[1].costo - a[1].costo).slice(0, 5)) {
  console.log(`   ${k.padEnd(45)} ${riassuntoLavoro(v)}`)
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
