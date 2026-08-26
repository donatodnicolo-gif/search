// Prova della regola con cui si SALVA una riga di diario corretta.
//
// ⚠️ Il caso che questa prova esiste per fermare: «100 rose da consegnare».
// Comincia con tre cifre, e se la correzione le trattasse da numero d'ordine la
// riga sparirebbe dentro l'ordine #100 — in silenzio, mentre chi scriveva stava
// correggendo un refuso più avanti.
//
//   npx tsx scripts/prova-correggi-riga.mts
import { correggiRiga, numeroInTesta } from '../src/lib/diario'

let male = 0
const prova = (nome: string, ok: boolean, extra = '') => {
  if (!ok) male++
  console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const j = (x: unknown) => JSON.stringify(x)

console.log('=== RIGHE SENZA ORDINE: il numero resta TESTO ===')
{
  const r = correggiRiga('100 rose da consegnare', false)
  prova('«100 rose» non diventa l’ordine #100', r.testo === '100 rose da consegnare' && r.ordineNumero === undefined, j(r))
}
{
  const r = correggiRiga('12562 chiama Bolzano', false)
  prova('nemmeno un numero che sembra un ordine', r.ordineNumero === undefined, j(r))
}
{
  const r = correggiRiga('  chiamare domani  ', false)
  prova('gli spazi ai bordi si tolgono', r.testo === 'chiamare domani', j(r))
}

console.log('\n=== RIGHE CON UN ORDINE: il numero in testa comanda ===')
{
  const r = correggiRiga('12817 PASTICCERIA SARNE', true)
  prova('lo stesso numero resta, e il testo si pulisce', r.testo === 'PASTICCERIA SARNE' && r.ordineNumero === '#12817', j(r))
}
{
  const r = correggiRiga('1741 nicolò per ferragosto', true)
  prova('un numero diverso SPOSTA la riga', r.ordineNumero === '#1741' && r.testo === 'nicolò per ferragosto', j(r))
}
{
  const r = correggiRiga('nicolò per ferragosto', true)
  prova('senza numero la riga si STACCA (ordineNumero vuoto)', r.ordineNumero === '' && r.testo === 'nicolò per ferragosto', j(r))
}
{
  const r = correggiRiga('#12817 con il cancelletto', true)
  prova('il cancelletto scritto a mano funziona uguale', r.ordineNumero === '#12817' && r.testo === 'con il cancelletto', j(r))
}
{
  // ⚠️ Se la riga fosse solo il numero, svuotarla cancellerebbe il testo.
  const r = correggiRiga('12817', true)
  prova('una riga fatta solo dal numero non resta vuota', r.testo === '12817', j(r))
}
{
  const r = correggiRiga('2 torte da preparare', true)
  prova('una cifra sola non è un ordine: la riga si stacca', r.ordineNumero === '' && r.testo === '2 torte da preparare', j(r))
}

console.log('\n=== LA REGOLA DI PARTENZA, per sicurezza ===')
prova('tre cifre in testa si riconoscono', numeroInTesta('100 rose').numero === '#100')
prova('un numero in mezzo NON si riconosce', numeroInTesta('per 27 agosto').numero === '')
prova('sette cifre non sono un ordine', numeroInTesta('1234567 cose').numero === '')

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
