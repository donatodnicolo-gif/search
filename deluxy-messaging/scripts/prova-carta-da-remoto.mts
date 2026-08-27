// «Carta da remoto» — il metodo nuovo, e la guardia sul numero della carta.
//
//   npx tsx scripts/prova-carta-da-remoto.mts
//
// ⚠️ La guardia si prova sui DUE versi: deve riconoscere i numeri di carta veri
// (altrimenti non serve a niente) e deve LASCIAR PASSARE i numeri lunghi che
// carte non sono — un IBAN incollato, un codice d'ordine — perché sbagliare in
// quel verso blocca il salvataggio, che è il danno peggiore
// ([[trappola-parser-provato-sui-dati-veri]]).
import { METODI, metodoValido, nomeMetodo, numeroDiCartaNelTesto, cosaManca } from '../src/lib/metodo-pagamento'

let fatte = 0
let rotte = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  fatte++
  const ok = JSON.stringify(avuto) === JSON.stringify(atteso)
  if (!ok) {
    rotte++
    console.log(`  ✗ ${nome}\n      atteso: ${JSON.stringify(atteso)}\n      avuto:  ${JSON.stringify(avuto)}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n— il metodo esiste ed è valido —')
prova('«carta» è un metodo valido', metodoValido('carta'), true)
prova('si chiama «Carta da remoto»', nomeMetodo('carta'), 'Carta da remoto')
prova('«Altro» resta in fondo', METODI[METODI.length - 1].chiave, 'altro')

console.log('\n— la guardia RICONOSCE una carta —')
// ⚠️ Numeri di prova pubblici dei circuiti (non sono carte di nessuno).
prova('Visa di prova', numeroDiCartaNelTesto('pagato con 4111111111111111'), '4111111111111111')
prova('a gruppi di quattro', numeroDiCartaNelTesto('carta 4111 1111 1111 1111 al telefono'), '4111 1111 1111 1111')
prova('coi trattini', numeroDiCartaNelTesto('5555-5555-5555-4444'), '5555-5555-5555-4444')
prova('Amex, 15 cifre', numeroDiCartaNelTesto('378282246310005'), '378282246310005')

console.log('\n— la guardia LASCIA PASSARE quello che carta non è —')
prova('le ultime quattro cifre', numeroDiCartaNelTesto('al telefono, carta ••4321'), '')
prova('un IBAN incollato', numeroDiCartaNelTesto('IT60X0542811101000000123456'), '')
prova('un numero d’ordine', numeroDiCartaNelTesto('ordine #2803'), '')
prova('una data', numeroDiCartaNelTesto('pagato il 27/08/2026'), '')
prova('16 cifre che non passano Luhn', numeroDiCartaNelTesto('1234567812345678'), '')
prova('campo vuoto', numeroDiCartaNelTesto(''), '')

console.log('\n— cosaManca —')
const base = { intestatario: 'Vallauris', iban: '', causale: 'Ordine #2803', ordineNumero: '#2803' }
prova(
  'carta senza riferimento: si chiede dove e quale',
  cosaManca({ ...base, metodo: 'carta', riferimento: '' }),
  'Scrivi dove è stata data la carta e quale carta (le ultime 4 cifre).'
)
prova(
  'carta con «al telefono, carta ••4321»: va bene',
  cosaManca({ ...base, metodo: 'carta', riferimento: 'al telefono, carta ••4321' }),
  ''
)
prova(
  'carta col numero intero: rifiutato',
  cosaManca({ ...base, metodo: 'carta', riferimento: 'carta 4111 1111 1111 1111' }).slice(0, 30),
  '«4111 1111 1111 1111» sembra i'
)
// ⚠️ La guardia vale per TUTTI i metodi: il campo è lo stesso.
prova(
  'il numero rifiutato anche in «altro»',
  cosaManca({ ...base, metodo: 'altro', riferimento: 'segnata la 4111111111111111' }) !== '',
  true
)
prova(
  '«altro» normale resta libero',
  cosaManca({ ...base, metodo: 'altro', riferimento: 'contanti alla consegna' }),
  ''
)

console.log(`\n${fatte - rotte}/${fatte} passate${rotte ? ` — ${rotte} ROTTE` : ''}`)
process.exit(rotte ? 1 : 0)
