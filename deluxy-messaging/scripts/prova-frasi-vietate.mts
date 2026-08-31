// Prova del filtro sulle risposte automatiche.
//
// ⚠️⚠️ IL CASO VERO, con lo schermo davanti (31/08/2026): a una cliente che
// chiedeva la stessa torta con un'altra scritta, la risposta automatica ha detto
// «mi dispiace informarla che il prodotto scelto non è attualmente disponibile».
// Non era vero e non era sapibile. Da qui il filtro — e questa prova, che tiene
// i due lati: quello che DEVE bloccare e quello che NON deve.
import { fraseVietata } from '../src/lib/frasi-vietate'

let male = 0
function blocca(nome: string, testo: string) {
  const p = fraseVietata(testo)
  const ok = p !== ''
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} BLOCCA ${nome}${ok ? ` (${p})` : ''}`)
}
function passa(nome: string, testo: string) {
  const p = fraseVietata(testo)
  const ok = p === ''
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} passa  ${nome}${ok ? '' : ` — bloccata per «${p}»`}`)
}

console.log('══ DEVE BLOCCARE ══')
blocca(
  'il messaggio vero mandato alla cliente',
  'Gentile Cliente, mi dispiace informarla che il prodotto scelto non è attualmente disponibile. Le propongo alternative di pari o superiore valore.'
)
blocca('«non disponibile» secco', 'Purtroppo quel prodotto non disponibile in questo periodo.')
blocca('plurale', 'Le torte con quella decorazione non sono disponibili.')
blocca('esaurito', 'Quel bouquet è esaurito.')
blocca('non possiamo realizzare', 'Non possiamo realizzare quella scritta sulla torta.')
blocca('non è possibile', 'Mi dispiace, non è possibile personalizzare questo prodotto.')
blocca('inglese: out of stock', 'Unfortunately this cake is out of stock.')
blocca('inglese: not available', 'That product is not available at the moment.')
blocca('inglese: we cannot', 'I am sorry, we cannot make that cake.')

console.log('\n══ NON DEVE BLOCCARE (o l’AI non risponde più a nessuno) ══')
passa(
  'la risposta giusta a quella cliente',
  'Certamente: possiamo preparare la torta con la scritta «Twenty One». Un collega le conferma prezzo e tempi appena rientra.'
)
passa('conferma semplice', 'Sì, si può fare. Le confermiamo tutto a breve.')
passa('presa in carico', 'Ho preso in carico la sua richiesta e la seguo io personalmente.')
passa(
  'disponibilità di una PERSONA, non del prodotto',
  'Siamo disponibili ad aiutarla: mi dica pure l’indirizzo di consegna.'
)
passa('parla di tempi, non di fattibilità', 'Per sabato facciamo in tempo, la consegna è confermata.')

console.log(male === 0 ? '\nTUTTO OK' : `\n${male} PROVE FALLITE`)
process.exit(male === 0 ? 0 : 1)
