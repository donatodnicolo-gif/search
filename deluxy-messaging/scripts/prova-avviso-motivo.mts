// Prova che «non avvisato» dica PERCHE'.
//
// ⚠️ Il motivo stava solo nel titolo del bollino: sul telefono il passaggio del
// mouse non esiste, quindi non si leggeva affatto. E i motivi sono cose
// diversissime: «manca l'ordine» si risolve in dieci secondi, «fuori dalle 24
// ore» vuol dire telefonare.
import { perchePersoAvviso } from '../src/lib/metodo-pagamento'

const casi: [string, string][] = [
  ['Questa richiesta non è collegata a un ordine, quindi non so a chi scrivere.', 'nessun ordine collegato'],
  ['Del fornitore non abbiamo né telefono né email.', 'il fornitore non ha recapiti'],
  ['WhatsApp ha rifiutato (131047): è la finestra di 24 ore di WhatsApp.', 'fuori dalle 24 ore di WhatsApp'],
  ['Nessuna casella di posta collegata.', 'nessuna casella di posta'],
  ['', ''],
]
let male = 0
for (const [dentro, atteso] of casi) {
  const avuto = perchePersoAvviso(dentro)
  const ok = avuto === atteso
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} «${dentro.slice(0, 40)}…» → «${avuto}»`)
}
// ⚠️ Un motivo sconosciuto NON diventa un generico «errore»: si mostra com'è,
// perché qualcuno lo deve poter leggere.
const ignoto = perchePersoAvviso('Il numero del fornitore non è su WhatsApp.')
console.log(`${ignoto.startsWith('Il numero') ? 'ok  ' : 'NO  '} motivo sconosciuto → si mostra il vero: «${ignoto}»`)
if (!ignoto.startsWith('Il numero')) male++
console.log(male === 0 ? '\nTutto a posto.' : `\n${male} sbagliati.`)
process.exit(male === 0 ? 0 : 1)
