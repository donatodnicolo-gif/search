// Le due regole corrette il 27/08/2026 dopo la revisione ostile:
// le ore coperte si UNISCONO (non si sommano) e il pallino si accende solo se
// la cosa più recente è PIÙ RECENTE (non solo «diversa»).
import { oreCoperte } from '../src/lib/ai-fuori-turno'
import { decidiPallini } from '../src/lib/pallini'

let male = 0
const prova = (nome: string, ok: boolean, extra = '') => { if (!ok) male++; console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`) }
const t = (giorno: number, dalle: string, alle: string) => ({ giorno, dalle, alle })

console.log('=== LE ORE COPERTE SI UNISCONO ===')
{
  // 3 operatori, lun-ven 09-18: 15 fasce, ma le ore coperte sono 45, non 135.
  const griglia = [1, 2, 3, 4, 5].flatMap((g) => [t(g, '09:00', '18:00'), t(g, '09:00', '18:00'), t(g, '09:00', '18:00')])
  const r = oreCoperte(griglia)
  prova('3 operatori lun-ven 09-18 → 45 ore, 123 scoperte', r.ore === 45 && r.scoperte === 123, `${r.ore} / ${r.scoperte}`)
}
{
  // 5 operatori: prima usciva «-57 ore scoperte».
  const griglia = [1, 2, 3, 4, 5].flatMap((g) => Array.from({ length: 5 }, () => t(g, '09:00', '18:00')))
  const r = oreCoperte(griglia)
  prova('5 operatori non danno più un numero negativo', r.scoperte === 123, String(r.scoperte))
}
{
  // La griglia VERA di oggi: 5 fasce di una persona sola, nessuna sovrapposizione.
  const r = oreCoperte([t(5, '09:00', '18:00'), t(6, '09:00', '12:00'), t(6, '15:00', '18:00'), t(7, '09:00', '12:00'), t(7, '15:00', '18:00')])
  prova('la griglia vera resta 21 ore su 168', r.ore === 21 && r.scoperte === 147, `${r.ore} / ${r.scoperte}`)
}
{
  const r = oreCoperte([t(1, '09:00', '12:00'), t(1, '12:00', '18:00')])
  prova('due fasce attaccate fanno una copertura sola', r.ore === 9, String(r.ore))
}
{
  const r = oreCoperte([t(1, '09:00', '13:00'), t(1, '11:00', '18:00')])
  prova('due fasce che si accavallano si uniscono', r.ore === 9, String(r.ore))
}
{
  const r = oreCoperte([t(1, '09:00', '12:00'), t(2, '09:00', '12:00')])
  prova('giorni diversi non si toccano', r.ore === 6, String(r.ore))
}
{
  const r = oreCoperte([t(1, '18:00', '09:00'), t(1, '10:00', '10:00')])
  prova('fasce impossibili non coprono niente', r.ore === 0, String(r.ore))
}
prova('griglia vuota = 168 ore scoperte', oreCoperte([]).scoperte === 168)

console.log('\n=== IL PALLINO SOLO SE È PIÙ RECENTE ===')
const A = '2026-08-27T09:00:00.000Z'
const B = '2026-08-27T10:00:00.000Z'
{
  const r = decidiPallini({ '/inbox': { ultimo: B } }, { '/inbox': A }, '/', false)
  prova('più recente → si accende', r.accesi.join() === '/inbox')
}
{
  // Il caso trovato dalla revisione: la riga più recente viene cestinata e
  // `ultimo` TORNA INDIETRO.
  const r = decidiPallini({ '/inbox': { ultimo: A } }, { '/inbox': B }, '/', false)
  prova('più VECCHIO (cosa sparita) → NON si accende', r.accesi.length === 0, JSON.stringify(r.accesi))
}
{
  const r = decidiPallini({ '/inbox': { ultimo: A } }, { '/inbox': A }, '/', false)
  prova('uguale → non si accende', r.accesi.length === 0)
}

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
