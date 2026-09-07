// PROVA: l'intestatario del conto puo essere diverso dal fornitore (07/09/2026).
//
// Regola dell utente: «l intestatario conto di un fornitore puo essere diverso
// da ragione sociale quindi deve essere consentito». Qui si prova la DECISIONE
// della riconciliazione (`decidi`, pura) e il ripiego `chiPrepara`, senza
// database ne sessione. Lancio: npx tsx scripts/prova-intestatario-diverso.mts
import { decidi, type DaRiconciliare } from '../src/lib/riconciliazione'
import { chiPrepara } from '../src/lib/chi-prepara'
import { cosaManca } from '../src/lib/metodo-pagamento'

let male = 0
function prova(nome: string, ok: boolean, nota = '') {
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${nota ? ' — ' + nota : ''}`)
  if (!ok) male++
}

const ordine = {
  id: 'o1',
  numero: '#1826',
  negozioNome: 'Cake',
  clienteNome: 'Freddy Okamba',
  totale: 115,
  valuta: 'EUR',
  gestione: 'in_pagamento',
  annullato: false,
  fornitoreNome: 'C&G Sweet Bakery',
  fornitoreCosto: null as number | null,
}
const base: DaRiconciliare = {
  richiestaId: 'r1',
  intestatario: 'Mario Rossi',
  fornitore: 'C&G Sweet Bakery',
  iban: '',
  importo: 115,
  metodo: 'iban',
  pagataIl: new Date().toISOString(),
  ordine,
  registro: null,
}

console.log('\n══ CHI PREPARA ══')
prova('col fornitore scritto vale lui', chiPrepara(base) === 'C&G Sweet Bakery')
prova('riga vecchia senza fornitore: vale l intestatario', chiPrepara({ intestatario: 'Mario Rossi', fornitore: '' }) === 'Mario Rossi')
prova('campo assente: vale l intestatario', chiPrepara({ intestatario: 'Mario Rossi' }) === 'Mario Rossi')

console.log('\n══ RICONCILIAZIONE ══')
{
  const g = decidi(base)
  prova('fornitore = ordine, conto di un altra persona: si registra il costo', g.verdetto === 'da-registrare', g.frase.slice(0, 90))
}
{
  const g = decidi({ ...base, ordine: { ...ordine, fornitoreCosto: 115 } })
  prova('  e con il costo gia scritto e «gia registrato»', g.verdetto === 'gia-registrato', g.frase.slice(0, 90))
}
{
  // ⚠️ Prima della correzione: l intestatario «Mario Rossi» contro il
  // fornitore «C&G Sweet Bakery» dava «costo-diverso · non lo sovrascrivo».
  const g = decidi({ ...base, fornitore: '' })
  prova('riga vecchia (solo intestatario diverso) resta «non lo sovrascrivo»', g.verdetto === 'costo-diverso', g.frase.slice(0, 90))
}
{
  const g = decidi({ ...base, fornitore: 'Pasticceria Bianchi' })
  prova('fornitore DIVERSO da quello sull ordine: non si sovrascrive', g.verdetto === 'costo-diverso' && g.frase.includes('per Pasticceria Bianchi (sul conto di Mario Rossi)'), g.frase.slice(0, 120))
}
{
  const g = decidi({ ...base, ordine: { ...ordine, fornitoreNome: '' } })
  prova('ordine senza fornitore: registra CHI PREPARA, non il conto', g.verdetto === 'da-registrare' && g.frase.startsWith('Registro C&G Sweet Bakery'), g.frase.slice(0, 90))
}
{
  const g = decidi({ ...base, intestatario: 'Freddy Okamba', ordine: { ...ordine, fornitoreNome: '' } })
  prova('conto intestato al CLIENTE: sembra un rimborso anche col fornitore scritto', g.verdetto === 'rimborso-al-cliente')
}

console.log('\n══ MODULO ══')
const modulo = { metodo: 'iban', iban: 'IT60X0542811101000000123456', riferimento: '', causale: '', ordineNumero: '' }
prova('intestatario diverso dal fornitore scelto passa', !cosaManca({ ...modulo, intestatario: 'Mario Rossi', fornitoreScelto: 'C&G Sweet Bakery' }))
prova('senza fornitore scelto si blocca ancora', !!cosaManca({ ...modulo, intestatario: 'Mario Rossi', fornitoreScelto: '' }))

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male ? 1 : 0)
