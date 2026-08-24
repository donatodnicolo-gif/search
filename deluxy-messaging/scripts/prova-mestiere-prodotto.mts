// Prova che l'elenco dei fornitori in zona mostri SOLO chi puo' fare
// quell'ordine.
//   npx tsx scripts/prova-mestiere-prodotto.mts
//
// ⚠️⚠️ Il controllo che conta e' quello che NON filtra: se il nome del prodotto
// non e' chiaro, o cita tutte e due le cose, si devono mostrare TUTTI. Un elenco
// accorciato per sbaglio fa sparire il fornitore giusto — e chi telefona non
// sospetta che manchi qualcuno, perche' una lista corta sembra una lista.
import { mestierePerNegozio, mestierePerProdotto } from '../src/lib/fornitori-zona'
import { db } from '../src/lib/db'

let falliti = 0
const v = (n: string, ok: boolean, d = '') => { if (!ok) falliti++; console.log(`  ${ok ? 'OK  ' : 'NO  '} ${n}${d ? ' — ' + d : ''}`) }

console.log('\n── Dal negozio (il segnale forte) ──')
v('CakeDesignMe → pasticceria', mestierePerNegozio('CakeDesignMe') === 'pasticceria')
v('Deluxy Flowers → fioraio', mestierePerNegozio('Deluxy Flowers') === 'fioraio')
v('Deluxy → non lo dice', mestierePerNegozio('Deluxy') === null)

console.log('\n── Dal prodotto ──')
v('«Torta Vivaldi» → pasticceria', mestierePerProdotto('Torta Vivaldi') === 'pasticceria')
v('«Bouquet Vivaldi medio-grande» → fioraio', mestierePerProdotto('Bouquet Vivaldi medio-grande') === 'fioraio')
v('«Composizione di rose rosse» → fioraio', mestierePerProdotto('Composizione di rose rosse') === 'fioraio')
v('«Cheesecake ai frutti di bosco» → pasticceria', mestierePerProdotto('Cheesecake ai frutti di bosco') === 'pasticceria')
v('«Praline di cioccolato» → pasticceria', mestierePerProdotto('Praline di cioccolato') === 'pasticceria')

console.log('\n── ⚠️ Quando NON si filtra ──')
v('torta E bouquet insieme: tutti', mestierePerProdotto('Torta e bouquet di rose') === null, 'un ordine che ne vuole due')
v('«Champagne Dom Perignon»: tutti', mestierePerProdotto('Champagne Dom Perignon') === null)
v('vuoto: tutti', mestierePerProdotto('') === null)
v('«Confezione regalo»: tutti', mestierePerProdotto('Confezione regalo') === null)

console.log('\n── Sui prodotti veri degli ordini ──')
const ordini = await db.ordine.findMany({
  where: { negozioNome: { not: '' } },
  select: { numero: true, negozioNome: true },
  take: 200,
  orderBy: { data: 'desc' },
})
const senzaMestiere = ordini.filter((o) => mestierePerNegozio(o.negozioNome) === null)
console.log(`  ${ordini.length} ordini · ${senzaMestiere.length} su un negozio che NON dice il mestiere`)
console.log('  (su quelli l’elenco mostrava pasticcerie e fiorai insieme: ora decide il prodotto)')

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
