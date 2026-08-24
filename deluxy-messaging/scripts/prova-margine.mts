// Prova il calcolo del margine sulla richiesta di pagamento.
//   npx tsx scripts/prova-margine.mts
//
// ⚠️⚠️ I due controlli che contano non sono i conti — quelli sono una divisione.
// Sono:
//  1. **senza la quota di Orders non si dà nessun verdetto**. Un «va bene»
//     calcolato su una regola inventata qui sarebbe peggio del silenzio: la
//     regola vive in Orders e cambia lì, e un 60% ricopiato resterebbe al vecchio
//     valore senza che nessuna schermata dia errore;
//  2. **la perdita è un caso a sé**, non un «oltre» più grande: se l'ordine ci
//     costa più di quanto è stato venduto, va detto con un'altra parola perché si
//     legga come un'altra cosa.
import { calcolaMargine, frasiMargine, pct } from '../src/lib/margine'
import { leggiQuotaFornitore } from '../src/lib/orders'
import { db } from '../src/lib/db'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

console.log('\n── I conti ──')
const m = calcolaMargine(300, 130, 60)!
verifica('quota al fornitore', Math.round(m.quotaFornitorePct * 10) / 10 === 43.3, pct(m.quotaFornitorePct))
verifica('margine in percentuale', Math.round(m.marginePct * 10) / 10 === 56.7, pct(m.marginePct))
verifica('margine in euro', m.margineEuro === 170, String(m.margineEuro))
verifica('verdetto: in linea', m.verdetto === 'ok')

console.log('\n── Il confine ──')
verifica('sotto la quota: va bene', calcolaMargine(300, 179, 60)!.verdetto === 'ok', '59,7%')
verifica('esattamente alla quota: va bene', calcolaMargine(300, 180, 60)!.verdetto === 'ok', '60,0%')
// ⚠️ 130 su 216,67 fa 59,9994%: senza la sfumatura sui decimali un accordo
// esattamente al 60% risulterebbe «oltre» per un millesimo, e si andrebbe a
// ridiscutere un prezzo che era giusto.
verifica(
  'un millesimo sotto per arrotondamento: va bene lo stesso',
  calcolaMargine(216.67, 130, 60)!.verdetto === 'ok',
  pct(calcolaMargine(216.67, 130, 60)!.quotaFornitorePct)
)
verifica('appena sopra: oltre', calcolaMargine(300, 190, 60)!.verdetto === 'oltre', '63,3%')

console.log('\n── ⚠️ La perdita è un caso a sé ──')
const p = calcolaMargine(100, 130, 60)!
verifica('paghiamo più del venduto → «perdita», non «oltre»', p.verdetto === 'perdita')
verifica(
  'e lo dice in euro, non in percentuale',
  frasiMargine(p).verdetto.includes('30,00'),
  frasiMargine(p).verdetto
)

console.log('\n── ⚠️ Senza la regola di Orders, nessun verdetto ──')
const senza = calcolaMargine(300, 130, null)!
verifica('verdetto sospeso', senza.verdetto === 'senza-verdetto')
verifica(
  'ma i numeri si mostrano lo stesso',
  frasiMargine(senza).riga.includes('43,3%'),
  frasiMargine(senza).riga
)
verifica(
  'e si dice PERCHÉ manca il giudizio',
  frasiMargine(senza).verdetto.toLowerCase().includes('orders'),
  frasiMargine(senza).verdetto
)
// ⚠️ Anche senza la regola, una perdita resta una perdita: non serve sapere la
// quota per accorgersi che stiamo pagando più di quanto abbiamo incassato.
verifica(
  'la perdita si vede anche senza la regola',
  calcolaMargine(100, 130, null)!.verdetto === 'perdita'
)

console.log('\n── Quando NON si calcola niente ──')
verifica('senza valore ordine: niente', calcolaMargine(0, 130, 60) === null)
verifica('senza importo: niente', calcolaMargine(300, 0, 60) === null)
verifica('importo non numerico: niente', calcolaMargine(300, NaN, 60) === null)

console.log('\n── La regola vera, chiesta a Deluxy Orders ──')
const q = await leggiQuotaFornitore()
if (q) {
  console.log(`  Orders risponde: al fornitore va il ${pct(q.quota)} (${q.dove})`)
  verifica('la quota è una percentuale sensata', q.quota > 0 && q.quota < 100)
  const esempio = calcolaMargine(300, 130, q.quota)!
  console.log(`  su un ordine da 300 € con 130 € al fornitore → ${esempio.verdetto}`)
} else {
  console.log(
    '  ⚠️ Orders non risponde (o non è configurato): la pagina mostrerà i numeri\n' +
      '     SENZA verdetto, dicendo perché. È il comportamento voluto.'
  )
}

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
