// Prova dell'unione di due ordini che sono una vendita sola.
//
// ⚠️⚠️ IL CASO VERO, segnalato dall'utente il 26/08/2026: «ada hunca» ha pagato
// la stessa torta con DUE ordini — #1777 (200 €) e #1798 (170 €) — e il
// fornitore è stato registrato su uno solo, col costo INTERO di 253 €. Su
// #1777, da solo, Orders calcola un margine di **−43,44 €**; sui due insieme
// (370 contro 253) è positivo. Senza unirli il lavoro si conta due volte, un
// margine è falso in negativo, e nelle KPI quel falso finisce addosso a un
// operatore.
//
// ⚠️ La prova gira sui DUE ORDINI VERI e, alla fine, RIMETTE TUTTO COM'ERA: se
// l'unione va fatta davvero, la fa una persona dalla scheda.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { disfaUnione, totaleConUniti, unisciOrdini } from '../src/lib/unione-ordini'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const principale = await db.ordine.findFirst({ where: { numero: '#1798' } })
const secondario = await db.ordine.findFirst({ where: { numero: '#1777' } })
if (!principale || !secondario) {
  console.log('I due ordini della segnalazione non ci sono più: niente da provare.')
  process.exit(0)
}
console.log(`#1798 ${principale.totale} € · #1777 ${secondario.totale} € · costo fornitore su #1777: ${secondario.fornitoreCosto ?? '-'} €\n`)

const eranoUniti = secondario.unitoA
try {
  // ── Le regole, prima di scrivere ──
  prova(
    'unire un ordine a sé stesso non si può',
    !(await unisciOrdini(principale.id, principale.numero)).ok
  )
  prova(
    'un numero che non esiste lo dice',
    !(await unisciOrdini(principale.id, '#999999')).ok,
    (await unisciOrdini(principale.id, '#999999')).messaggio
  )

  // ── L'unione ──
  const esito = await unisciOrdini(principale.id, '#1777', 'prova automatica')
  prova("l'unione riesce", esito.ok, esito.messaggio.slice(0, 80))
  // ⚠️⚠️ E il messaggio DEVE dire che Orders resta con due ordini: se lo
  // tacesse, chi unisce crederebbe di aver aggiustato anche il margine di là.
  prova(
    'il messaggio avverte che in Orders restano due ordini',
    esito.messaggio.includes('Deluxy Orders')
  )

  const insieme = await totaleConUniti('#1798', principale.totale)
  prova(
    'il totale è la somma dei due',
    Math.abs(insieme.totale - (principale.totale + secondario.totale)) < 0.01,
    `${insieme.totale} €`
  )
  prova('e l elenco degli uniti contiene #1777', insieme.uniti.some((u) => u.numero === '#1777'))

  // ⚠️ Con 370 € di venduto contro 253 di costo il margine torna positivo: è
  // tutto il senso dell'unione.
  const costo = secondario.fornitoreCosto ?? 0
  if (costo) {
    prova(
      'insieme il lavoro è in attivo, da solo no',
      insieme.totale > costo && secondario.totale < costo,
      `${insieme.totale} contro ${costo}, mentre #1777 da solo faceva ${secondario.totale}`
    )
  }

  // ── Le regole dopo l'unione ──
  const doppia = await unisciOrdini(secondario.id, '#1798')
  prova('un ordine già unito non può fare da principale', !doppia.ok, doppia.messaggio.slice(0, 70))

  // ── Disfare ──
  const disfatto = await disfaUnione(secondario.id)
  prova('si disfa', disfatto.ok, disfatto.messaggio)
  const dopo = await totaleConUniti('#1798', principale.totale)
  prova('e il totale torna quello di prima', Math.abs(dopo.totale - principale.totale) < 0.01, `${dopo.totale} €`)
} finally {
  // ⚠️ Si rimette esattamente com'era, qualunque cosa sia successa.
  await db.ordine.update({
    where: { id: secondario.id },
    data: eranoUniti
      ? { unitoA: eranoUniti, unitoIl: secondario.unitoIl, unitoDaNome: secondario.unitoDaNome }
      : { unitoA: '', unitoIl: null, unitoDaNome: '' },
  })
  const controllo = await db.ordine.findUnique({ where: { id: secondario.id }, select: { unitoA: true } })
  console.log(`\nrimesso com'era: #1777 unitoA = «${controllo?.unitoA ?? ''}»`)
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
