// Prova di «Hanno già preparato ordini per noi», sui dati veri.
//
// ⚠️⚠️ Nasce dalla segnalazione dell'utente sull'ordine #2798: «non vedo
// passiflora tra i fornitori». Passiflora quell'ordine l'aveva preparato, ma
// nel registro non ha né città né categoria, e l'elenco «fornitori in zona»
// filtra per provincia e per mestiere: per lui, non esiste. Questa prova
// pretende che nella lista dei NOSTRI ci sia.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { nostriFornitori, ordinaPerConsegna } from '../src/lib/nostri-fornitori'
import { riassuntoLavoro } from '../src/lib/cerca-fornitore'
import { siglaProvincia } from '../src/lib/province'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const elenco = await nostriFornitori()
console.log(`fornitori che risultano dai nostri ordini: ${elenco.length}\n`)

prova('l elenco non è vuoto', elenco.length > 0)
// ⚠️ Il caso segnalato, per nome.
const passiflora = elenco.find((f) => f.nome.toLowerCase().includes('passiflora'))
prova('Passiflora c è', !!passiflora, passiflora ? riassuntoLavoro(passiflora.lavoro) : 'MANCA')
if (passiflora) {
  prova('e porta il suo lavoro', passiflora.lavoro.ordini > 0 && passiflora.lavoro.costo > 0, riassuntoLavoro(passiflora.lavoro))
  prova('e le città delle consegne', passiflora.citta.length > 0, passiflora.citta.join(', '))
}

// ⚠️⚠️ La prova che conta sull'ordine dell'elenco: chi ha già consegnato in
// QUELLA città sta in cima. È la decisione di chi lavora, non un dettaglio.
console.log('\n══ ORDINE PER LA CONSEGNA DI #2798 (Mijas) ══')
const ordine = await db.ordine.findFirst({ where: { numero: '#2798' }, select: { citta: true, fornitoreNome: true } })
console.log(`   consegna a: ${ordine?.citta ?? '(sconosciuta)'} · preparato da: ${ordine?.fornitoreNome ?? '-'}`)
if (ordine?.citta) {
  const messi = ordinaPerConsegna(elenco, ordine.citta, '')
  console.log(`   primo della lista: ${messi[0]?.nome}`)
  prova(
    'in cima c è chi ha già consegnato in quella città',
    messi[0]?.citta.some((c) => c.toLowerCase() === ordine.citta.toLowerCase()) ?? false,
    messi[0] ? messi[0].citta.join(', ') : ''
  )
  prova(
    'ed è proprio chi ha preparato quest ordine',
    messi[0]?.nome === ordine.fornitoreNome,
    `${messi[0]?.nome} contro ${ordine.fornitoreNome}`
  )
}

// ⚠️ «MA» di Málaga non è una provincia italiana: l'elenco per zona non può
// funzionare, e il messaggio a schermo deve dirlo invece di dire «non ne
// abbiamo». Qui si verifica il fatto da cui nasce quel messaggio.
console.log('\n══ LA PROVINCIA CHE NON È UNA PROVINCIA ══')
prova('«MA» non è una sigla italiana', siglaProvincia('MA') === '', `«${siglaProvincia('MA')}»`)
prova('«MS» (Massa-Carrara) invece sì', siglaProvincia('MS') === 'MS')
prova('e «Firenze» si riconosce dal nome', siglaProvincia('Firenze') === 'FI')

console.log('\n══ I PRIMI CINQUE ══')
for (const f of elenco.slice(0, 5)) {
  console.log(`   ${f.nome.slice(0, 40).padEnd(42)} ${riassuntoLavoro(f.lavoro)} · ${f.citta.slice(0, 2).join(', ')}`)
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
