// Prova del bottone «Paga fornitore»: dall'ordine alla richiesta di pagamento.
//
// ⚠️⚠️ IL CASO VERO, segnalato dall'utente il 25/08/2026. Aprendo
//   /pagamenti?ordine=%232792&cliente=Darya+Byelikova&importo=135
// il campo «Ordine» restava VUOTO — pur essendo partiti dalla scheda di
// quell'ordine. Non era un guasto della ricerca: la pagina riceveva solo il
// NUMERO, e il numero non è un'identità. Cercando «2792» tornano DUE ordini
// (#2792 di FLowers e #12792 di Deluxy), e davanti a due il collegamento
// automatico si ferma di proposito — sceglierne uno vorrebbe dire calcolare il
// margine sul valore dell'altro.
//
// La prova gira sui DATI VERI: se domani quei due ordini non ci fossero più, il
// caso si direbbe non riproducibile invece di dirsi superato.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { linkPagamentoOrdine, riconosciOrdine } from '../src/lib/link-ordine'

const db = new PrismaClient()
let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

console.log('══ IL LINK PORTA L IDENTITA, NON SOLO IL NUMERO ══')
const finto = {
  id: 'abc123',
  numero: '#2792',
  clienteNome: 'Darya Byelikova',
  negozioNome: 'FLowers',
  totale: 135,
  fornitoreNome: 'Sa Commercial Garden Group srls',
  fornitoreCosto: 70,
}
const link = linkPagamentoOrdine(finto)
prova('c e l id dell ordine', link.includes('ordineId=abc123'), link)
prova('c e il negozio', link.includes('negozio=FLowers'))
prova('c e il fornitore', link.includes('fornitore=Sa+Commercial+Garden+Group+srls'))
prova('c e il costo concordato, non il venduto', link.includes('costo=70'))
prova('il numero tiene il cancelletto', link.includes('ordine=%232792'))
// ⚠️ Un ordine senza fornitore non deve inventarne uno.
const senza = linkPagamentoOrdine({ ...finto, fornitoreNome: '', fornitoreCosto: null })
prova('senza fornitore, niente parametro fornitore', !senza.includes('fornitore='))
prova('e nemmeno un costo', !senza.includes('costo='))

console.log('\n══ IL CASO #2792, SUI DATI VERI ══')
const trovati = await db.ordine.findMany({
  where: { numero: { contains: '2792' } },
  select: { id: true, numero: true, negozioNome: true, clienteNome: true, totale: true },
  orderBy: { data: 'desc' },
})
console.log(`   cercando «2792» si trovano ${trovati.length}: ${trovati.map((o) => `${o.numero} (${o.negozioNome})`).join(', ')}`)
const vero = trovati.find((o) => o.numero === '#2792')
prova('l ordine #2792 esiste', !!vero)
// ⚠️ Il difetto in una riga: con più di un risultato la vecchia regola («uno
// solo») non collegava niente. Se un giorno tornasse uno solo, questa riga si
// spegne da sola e il resto della prova non dimostrerebbe più niente: si dice.
if (trovati.length > 1) {
  prova('la vecchia regola («uno solo») NON avrebbe collegato', riconosciOrdine(trovati, '2792') === undefined)
} else {
  console.log('   ⚠️ oggi il numero è ambiguo su un solo ordine: il caso non è più riproducibile')
}
if (vero) {
  prova('con l id si riconosce', riconosciOrdine(trovati, '2792', vero.id)?.numero === '#2792')
  prova(
    'col solo negozio si riconosce lo stesso',
    riconosciOrdine(trovati, '2792', undefined, vero.negozioNome)?.id === vero.id
  )
  prova(
    'ed è quello giusto: cliente e totale del link',
    riconosciOrdine(trovati, '2792', vero.id)?.clienteNome === 'Darya Byelikova' &&
      riconosciOrdine(trovati, '2792', vero.id)?.totale === 135
  )
  // ⚠️⚠️ La prova che conta davvero: un id che NON è di questo elenco non deve
  // far collegare «il più simile». Meglio un campo vuoto che l ordine sbagliato.
  prova(
    'un id sconosciuto non fa ripiegare sul somigliante',
    riconosciOrdine(trovati, '2792', 'id-che-non-esiste') === undefined
  )
  prova(
    'un negozio sbagliato non collega',
    riconosciOrdine(trovati, '2792', undefined, 'Negozio Inesistente') === undefined
  )
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
