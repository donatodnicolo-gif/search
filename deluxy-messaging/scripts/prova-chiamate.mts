// Prova del riconoscimento dei numeri dentro le notifiche del centralino.
//
// ⚠️⚠️ ONESTÀ SULLA COPERTURA: al 26/08/2026 la casella `chiamate@deluxy.it` è
// appena stata aperta e **non abbiamo ancora una notifica vera**. Questi casi
// sono le forme che i centralini usano di solito, scritte a mano — non un
// campione misurato. La differenza conta: un parser scritto sull'esempio che si
// ha in mano ne riconosceva 1 su 3 quando è arrivato il dato vero.
//
// Perciò due cose:
//  1. quando arriva la PRIMA notifica vera, si incolla qui il suo testo e si
//     rimisura (è il motivo per cui la chiamata conserva il testo intero);
//  2. il codice non deve MAI inventare: se non riconosce, la riga lo dice e
//     l'operatore corregge il numero a mano.
//
// La prova tiene i due lati: quello che DEVE riconoscere, e quello che NON deve
// scambiare per un numero di telefono.
import { numeriDaNotifica } from '../src/lib/chiamate'

let male = 0
function prova(nome: string, atteso: string, oggetto: string, testo: string) {
  const avuto = numeriDaNotifica(oggetto, testo)
  const ok = avuto.chiamante === atteso
  if (!ok) male++
  console.log(
    `${ok ? 'ok  ' : 'NO  '} ${nome}  (atteso «${atteso}», avuto «${avuto.chiamante}» via ${avuto.come})`
  )
}

console.log('══ LE NOTIFICHE VERE (GlooboBiz, dal 01/09/2026) ══')
// ⚠️⚠️ Queste due sono le PRIME notifiche vere, incollate dalla tabella. Il
// parser scritto a mano le prendeva AL CONTRARIO: nessuna etichetta nota, quindi
// «primo numero» — che è il nostro. 16 chiamate su 16 registrate col nostro
// centralino come chiamante (handoff 05/09).
prova(
  'GlooboBiz, «sul tuo Numero Virtuale X, dal numero Y» (X a capo, virgola)',
  '00393398321681',
  'Hai ricevuto una chiamata sul tuo Numero Virtuale',
  'Ciao\n\nIn data 01/09/2026 16:18 hai ricevuto un nuova chiamata sul tuo Numero Virtuale\n390282952899, dal numero 00393398321681.\n\nRicevi quest\'email di servizio perché hai attivato la ricezione della mail per\nogni chiamata ricevuta.'
)
prova(
  'GlooboBiz, chiamata persa «mentre eri occupato»',
  '00491796974947',
  'Hai ricevuto una nuova chiamata sul tuo Numero Virtuale!',
  'Ciao\n\nil giorno 04/09/2026 14:39 hai ricevuto una chiamata sul tuo Numero Virtuale\n00390282941380 dal numero 00491796974947, mentre eri occupato/a o non\nraggiungibile.\n\nPer non perdere il tuo contatto, richiama subito il numero 00491796974947!'
)
{
  const g = numeriDaNotifica(
    'Hai ricevuto una chiamata sul tuo Numero Virtuale',
    'hai ricevuto un nuova chiamata sul tuo Numero Virtuale\n390282952899, dal numero 00393398321681.'
  )
  const ok = g.chiamato === '390282952899'
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} GlooboBiz: il NOSTRO numero finisce in «chiamato» (avuto «${g.chiamato}»)`)
}
{
  // Senza etichette riconosciute, ma sapendo quali numeri sono nostri, il
  // ripiego non deve più scambiare il centralino per il cliente.
  const g = numeriDaNotifica('Notifica', 'Numeri: 390282952899 e 00393398321681.', ['+390282952899'])
  const ok = g.chiamante === '00393398321681' && g.chiamato === '390282952899'
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ripiego con i nostri numeri noti: salta il centralino (avuto «${g.chiamante}» / «${g.chiamato}»)`)
}

console.log('\n══ DEVE RICONOSCERE CHI HA CHIAMATO ══')
prova(
  'chiamata persa, formato italiano con spazi',
  '+393498853209',
  'Chiamata persa',
  'Chiamata persa da +39 349 885 3209 il 26/08/2026 alle 10:35'
)
prova(
  'etichetta «Chiamante:»',
  '+393498853209',
  'Nuova chiamata',
  'Chiamante: +393498853209\nChiamato: +390212345678\nDurata: 0:00'
)
prova(
  'inglese, «From:»',
  '+393498853209',
  'Missed call',
  'From: +39 349 885 3209\nTo: +39 02 1234 5678\nDuration: 0s'
)
prova(
  'numero fisso italiano senza prefisso internazionale',
  '0212345678',
  'Chiamata ricevuta',
  'Chiamata da 02 1234 5678'
)
prova(
  'numero nell oggetto e non nel corpo',
  '+393498853209',
  'Chiamata persa da +39 349 885 3209',
  'Vedi il pannello per i dettagli.'
)
prova(
  'nessuna etichetta: si prende il primo numero, ma si dichiara',
  '+393498853209',
  'Notifica',
  'Il numero +39 349 885 3209 ha provato a contattarti.'
)

console.log('\n══ NON DEVE SCAMBIARE ALTRO PER UN TELEFONO ══')
function provaVuoto(nome: string, oggetto: string, testo: string) {
  const avuto = numeriDaNotifica(oggetto, testo)
  const ok = avuto.chiamante === ''
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}  (avuto «${avuto.chiamante}»)`)
}
// ⚠️ «26/08/2026» ridotto a cifre fa 26082026: OTTO cifre, esattamente la
// soglia di un telefono. Senza il filtro sulle date, ogni notifica avrebbe
// avuto un chiamante inventato — e sarebbe stato un numero credibile.
provaVuoto('una data non è un numero', 'Chiamata', 'Ricevuta il 26/08/2026 alle 10:35:12')
provaVuoto('un orario non è un numero', 'Chiamata', 'Alle 10:35:12, durata 00:00:07')
provaVuoto('un codice di 10 cifre che non comincia da 0/3/+', 'Notifica', 'Riferimento 8812345678')
provaVuoto('un numero troppo corto', 'Notifica', 'Interno 3401')
provaVuoto('una notifica senza numeri', 'Chiamata persa', 'Hai una chiamata persa. Accedi al pannello.')

console.log('\n══ IL NOSTRO NUMERO, QUANDO LA NOTIFICA LO DICE ══')
const conChiamato = numeriDaNotifica(
  'Nuova chiamata',
  'Chiamante: +393498853209\nChiamato: +390212345678'
)
const okChiamato = conChiamato.chiamato === '+390212345678'
if (!okChiamato) male++
console.log(
  `${okChiamato ? 'ok  ' : 'NO  '} il numero chiamato si legge (avuto «${conChiamato.chiamato}»)`
)
// ⚠️ Serve a dare un MARCHIO alle chiamate di chi non è ancora cliente: senza
// ordini da cui dedurlo, il nostro numero che ha squillato è l'unica cosa che
// leghi quella telefonata a un brand.

console.log(male === 0 ? '\nTUTTO OK' : `\n${male} PROVE FALLITE`)
process.exit(male === 0 ? 0 : 1)
