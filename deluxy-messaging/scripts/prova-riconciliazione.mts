// Prova della riconciliazione: soprattutto di quello che NON deve fare.
//
// ⚠️⚠️ Il caso che questa prova esiste per fermare: un RIMBORSO al cliente
// registrato come costo di fornitura. Sarebbe un danno doppio e invisibile —
// direbbe che il cliente si è preparato l'ordine da solo, e sottrarrebbe quella
// cifra dal margine, che resterebbe falso per sempre senza che nessuno se ne
// accorga.
import { decidi, sembraIlCliente, scostamento, valoreSospeso, type DaRiconciliare } from '../src/lib/riconciliazione'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const ordineBase = {
  id: 'o1',
  numero: '#2785',
  negozioNome: 'FLowers',
  clienteNome: 'Marta Bianchi',
  totale: 135,
  valuta: 'EUR',
  gestione: 'in_pagamento',
  annullato: false,
  fornitoreNome: '',
  fornitoreCosto: null as number | null,
}
const base: DaRiconciliare = {
  richiestaId: 'r1',
  intestatario: 'Battistella fioreria srl',
  iban: 'IT68P0830000000000000000',
  importo: 80,
  metodo: 'iban',
  pagataIl: '2026-08-24',
  ordine: { ...ordineBase },
  registro: null,
}

console.log('══ IL CASO NORMALE ══')
{
  const r = decidi(base)
  prova('un fornitore su un ordine vuoto si registra', r.verdetto === 'da-registrare', r.verdetto)
  prova('e mostra il margine che ne risulta', !!r.margine && Math.round(r.margine.marginePct) === 41, r.frase)
}

console.log('\n══ IL RIMBORSO (il controllo che conta) ══')
for (const nome of ['Marta Bianchi', 'BIANCHI MARTA', 'marta  bianchi', 'Marta Bianchì']) {
  const r = decidi({ ...base, intestatario: nome })
  prova(`«${nome}» = il cliente → NON si registra`, r.verdetto === 'rimborso-al-cliente', r.verdetto)
  if (r.verdetto === 'rimborso-al-cliente') {
    prova(`  e non mostra nessun margine`, r.margine === null)
  }
}
// ⚠️ Il contrario: un fornitore che per caso condivide UNA parola col cliente
// non deve diventare un «rimborso», o la riconciliazione non registra più niente.
{
  const r = decidi({ ...base, ordine: { ...ordineBase, clienteNome: 'Marta Rossi' }, intestatario: 'Fioreria Rossi srl' })
  prova('un cognome in comune NON basta a gridare al rimborso', r.verdetto === 'da-registrare', r.verdetto)
}
prova('un nome solo non basta', !sembraIlCliente('Marta', 'Marta Bianchi'))
prova('vuoto non corrisponde a niente', !sembraIlCliente('', 'Marta Bianchi'))

console.log('\n══ QUELLO CHE NON SI SOVRASCRIVE ══')
{
  const r = decidi({ ...base, ordine: { ...ordineBase, fornitoreNome: 'Un Altro Fioraio', fornitoreCosto: 70 } })
  prova('un fornitore DIVERSO gia scritto non si tocca', r.verdetto === 'costo-diverso', r.frase)
}
{
  const r = decidi({ ...base, ordine: { ...ordineBase, fornitoreNome: 'Battistella fioreria srl', fornitoreCosto: 70 } })
  prova('lo stesso fornitore ma con un costo diverso si segnala', r.verdetto === 'costo-diverso', r.frase)
}
{
  const r = decidi({ ...base, ordine: { ...ordineBase, fornitoreNome: 'Battistella fioreria srl', fornitoreCosto: 80 } })
  prova('gia a posto = non si rifa', r.verdetto === 'gia-registrato', r.verdetto)
}
{
  const r = decidi({ ...base, ordine: { ...ordineBase, fornitoreNome: 'Battistella fioreria srl', fornitoreCosto: null } })
  prova('nome gia scritto ma costo mancante: si aggiunge solo il costo', r.verdetto === 'da-registrare', r.frase)
}

console.log('\n══ CIO SU CUI NON SI LAVORA ══')
{
  const r = decidi({ ...base, ordine: { ...ordineBase, annullato: true } })
  prova('ordine annullato: niente', r.verdetto === 'ordine-annullato', r.verdetto)
  prova('  e nessun margine su un ordine annullato', r.margine === null)
}
{
  const r = decidi({ ...base, ordine: null })
  prova('senza ordine collegato: niente', r.verdetto === 'senza-ordine', r.verdetto)
}

console.log('\n══ LO STATO CHE CONTRADDICE IL PAGAMENTO ══')
{
  const r = decidi({ ...base, ordine: { ...ordineBase, gestione: 'da_gestire' } })
  prova('pagato ma «da iniziare» → da allineare', r.statoDaAllineare === true)
  const s = decidi({ ...base, ordine: { ...ordineBase, gestione: 'attesa_consegna' } })
  prova('pagato e in attesa di consegna → coerente', s.statoDaAllineare === false)
}

console.log('\n══ ARITMETICA ══')
prova('80 e 80,000000001 sono lo stesso accordo', !scostamento(80, 80.000000001))
prova('80 e 70 no', scostamento(80, 70))
{
  const righe = [decidi(base), decidi({ ...base, intestatario: 'Marta Bianchi' })]
  const v = valoreSospeso(righe)
  prova('il sospeso conta solo cio che si puo fare', v.ordini === 1 && Math.round(v.margine) === 55, `${v.ordini} ordini, ${v.margine}€`)
}

// ══════════════════════════════════════════════════════════════════════════
// RICONOSCERE UN NOME NEL REGISTRO
//
// ⚠️⚠️ I tre casi qui sotto sono usciti DAVVERO dai pagamenti veri, il 24/08,
// con la regola larga della casella di ricerca («basta una parola»): la
// schermata scriveva «Nel registro: X» come un fatto, e il fatto era falso.
// ══════════════════════════════════════════════════════════════════════════
import { stessaIdentita, paroleDistintive } from '../src/lib/riconciliazione'

console.log('\n══ IL REGISTRO: CHI E DAVVERO LUI ══')
const falsi: [string, string][] = [
  ['Battistella fioreria srl', 'BEYOND 142 SRL'],
  ['Goshà flowers', 'ANTOFLOWERS DI ANTONELLA RICCHETTI'],
  ['donna di fiori di Longo Michela', 'LOPS ANGELA'],
  ['Fioreria Rossi', 'Pasticceria Rossini'],
]
for (const [pagato, registro] of falsi) {
  prova(`«${pagato}» NON è «${registro}»`, !stessaIdentita(pagato, registro))
}
const veri: [string, string][] = [
  ['RIGUTTO ELENA', 'Il Giardino Di Rigutto Elena'],
  ['Battistella fioreria srl', 'BATTISTELLA FIORERIA S.R.L.'],
  ['Goshà flowers', 'GOSHA FLOWERS DI G. B.'],
  ["SO'FLEUR", "SO'FLEUR"],
]
for (const [pagato, registro] of veri) {
  prova(`«${pagato}» È «${registro}»`, stessaIdentita(pagato, registro))
}
prova('«fiori srl» non ha parole che identifichino qualcuno', paroleDistintive('fiori srl').length === 0)
prova('un cognome solo non aggancia ogni omonimo', !stessaIdentita('Rossi', 'Rossi Giovanni Fioreria'))

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
