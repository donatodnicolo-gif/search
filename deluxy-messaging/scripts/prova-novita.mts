// Prova di `src/lib/novita.ts` sui DATI VERI del database.
//
// ⚠️ Esiste perché la rotta `/api/novita` sta dietro al login: una prova che
// deve prima autenticarsi non la scrive nessuno, e quelle query resterebbero
// non provate. Da qui invece si chiama la funzione com'è.
//
//   npx tsx scripts/prova-novita.mts            → le ultime 24 ore
//   npx tsx scripts/prova-novita.mts 168        → l'ultima settimana
import 'dotenv/config'
import { novitaDa } from '../src/lib/novita'

const ore = Number(process.argv[2] || '24')
let male = 0
const prova = (nome: string, ok: boolean, extra = '') => {
  if (!ok) male++
  console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`)
}

// 1. La prima chiamata non deve mostrare NIENTE, solo il segnaposto.
const prima = await novitaDa(null, 'Nicolo Daniele Donato')
prova('la prima chiamata non mostra niente', prima.novita.length === 0, `${prima.novita.length} novità`)
prova('la prima chiamata torna l orologio', !!prima.adesso && !Number.isNaN(Date.parse(prima.adesso)), prima.adesso)

// 2. Un segnaposto nel passato deve raccontare cosa è successo.
const da = new Date(Date.now() - ore * 3600 * 1000)
const r = await novitaDa(da, 'Nicolo Daniele Donato')
console.log(`\n=== ULTIME ${ore} ORE (da ${da.toISOString()}) ===`)
console.log(`${r.novita.length} novità${r.troncato ? ' (TRONCATO: ce ne sono altre)' : ''}\n`)
const perTipo: Record<string, number> = {}
for (const n of r.novita) perTipo[n.tipo] = (perTipo[n.tipo] ?? 0) + 1
console.log('per tipo:', JSON.stringify(perTipo))
console.log()
for (const n of r.novita.slice(0, 25)) {
  console.log(` [${n.tipo}] ${n.titolo}`)
  console.log(`      ${n.dettaglio}`)
  console.log(`      ${new Date(n.quando).toLocaleString('it-IT')} · ${n.link} · ${n.gravita}`)
}

console.log('\n=== CONTROLLI ===')
prova('ordinate dalla più recente', r.novita.every((n, i) => i === 0 || r.novita[i - 1].quando >= n.quando))
prova('nessun id ripetuto', new Set(r.novita.map((n) => n.id)).size === r.novita.length)
prova('tutte hanno un link', r.novita.every((n) => n.link.startsWith('/')))
prova('tutte hanno un titolo', r.novita.every((n) => n.titolo.trim().length > 0))
prova(
  'nessun dettaglio più lungo di 90',
  r.novita.every((n) => n.dettaglio.length <= 90),
  String(Math.max(0, ...r.novita.map((n) => n.dettaglio.length)))
)
prova(
  'niente più vecchio del segnaposto',
  r.novita.every((n) => new Date(n.quando) > da)
)
prova(
  'niente più recente dell orologio',
  r.novita.every((n) => new Date(n.quando) <= new Date(r.adesso))
)
// ⚠️ Il controllo che conta davvero: chiedendo DUE volte con lo stesso
// segnaposto si deve avere la stessa cosa, e chiedendo dal `adesso` della prima
// non deve tornare niente di già visto.
const dopo = await novitaDa(new Date(r.adesso), 'Nicolo Daniele Donato')
const ripetute = dopo.novita.filter((n) => r.novita.some((x) => x.id === n.id))
prova('il giro dopo non ripete niente', ripetute.length === 0, ripetute.map((x) => x.id).join(', '))

// ⚠️ Le mie non me le racconta: si prova col nome di chi ha pagato davvero.
const conNome = await novitaDa(da, 'Nicolo Daniele Donato')
const senzaNome = await novitaDa(da, 'Nessuno Che Esiste')
prova(
  'i pagamenti fatti da me non li vedo io',
  conNome.novita.filter((n) => n.tipo === 'pagamento').length <=
    senzaNome.novita.filter((n) => n.tipo === 'pagamento').length,
  `io ${conNome.novita.filter((n) => n.tipo === 'pagamento').length} · altri ${senzaNome.novita.filter((n) => n.tipo === 'pagamento').length}`
)

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
