// Prova che l'elenco del catalogo mostri UN PRODOTTO PER SCHEDA, e le varianti
// solo dentro il prodotto.
//   npx tsx scripts/prova-elenco-prodotti.mts
//
// ⚠️ Legge il catalogo VERO: il conto che interessa e' quante schede vede chi
// cerca. Prima erano trenta (una per taglia), e sei avevano lo stesso titolo.
import { cercaProdotti } from '../src/lib/nuovo-ordine'
import { db } from '../src/lib/db'

const negozi = await db.negozioShopify.findMany({ select: { id: true, nome: true } })
console.log('Negozi:', negozi.map((n) => n.id).join(', '))

for (const parola of ['botticelli', 'rose']) {
  for (const n of negozi.slice(0, 2)) {
    const e = await cercaProdotti(n.id, parola)
    if (e.stato !== 'ok') {
      console.log(`\n«${parola}» su ${n.id}: ${e.stato}`)
      continue
    }
    console.log(`\n«${parola}» su ${n.id}: ${e.raggruppati.length} schede (prima erano ${e.prodotti.length} righe)`)
    for (const g of e.raggruppati.slice(0, 5)) {
      console.log(`  · ${g.titolo} — ${g.varianti.length} varianti: ${g.varianti.map((v) => v.variante || 'unica').join(', ')}`)
    }
    const doppi = new Set(e.raggruppati.map((g) => g.titolo)).size !== e.raggruppati.length
    console.log(doppi ? '  NO  titoli ripetuti fra le schede' : '  OK  nessun titolo ripetuto')
  }
}
await db.$disconnect()
