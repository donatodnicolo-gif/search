import { ordineNominatoNellaCausale } from '../src/lib/metodo-pagamento'
import { inizioOggi, inizioDomani } from '../src/lib/urgenza'

let male = 0
const prova = (nome: string, ok: boolean, extra = '') => { if (!ok) male++; console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`) }

console.log('=== IL NUMERO D’ORDINE NELLA CAUSALE ===')
const casi: [string, string][] = [
  // devono ESSERE riconosciuti (le causali vere in tabella)
  ['2780', '#2780'],
  ['ordine 2785', '#2785'],
  ['Ordine #12809', '#12809'],
  ['saldo ordine 1741 fiori', '#1741'],
  ['#2799', '#2799'],
  // NON devono essere riconosciuti (i falsi positivi che bloccavano)
  ['Canone agosto 2026', ''],
  ['Fattura 2026/114', ''],
  ['Bonifico del 25/08/2026', ''],
  ['Rimborso spese carburante 2026', ''],
  ['saldo IBAN IT60X0542811101000000123456', ''],
  ['saldo fattura 114', ''],
  ['acconto 50%', ''],
  ['ordine 2026', '#2026'],
  ['2026', ''],
  ['', ''],
]
for (const [causale, atteso] of casi) {
  const avuto = ordineNominatoNellaCausale(causale)
  prova(`«${causale}» → ${atteso || '(niente)'}`, avuto === atteso, avuto === atteso ? '' : `ha dato «${avuto}»`)
}

console.log('\n=== «OGGI» È OGGI A ROMA ===')
const oggi = inizioOggi()
const aRoma = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
prova('la data combacia col giorno di Roma', oggi.toISOString().slice(0, 10) === aRoma, `${oggi.toISOString()} vs ${aRoma}`)
prova('è mezzanotte UTC', oggi.toISOString().endsWith('T00:00:00.000Z'), oggi.toISOString())
prova('domani è un giorno dopo', inizioDomani().getTime() - oggi.getTime() === 86400000)

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
