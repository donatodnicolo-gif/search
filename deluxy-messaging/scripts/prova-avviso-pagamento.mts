// Prova del testo dell avviso «pagamento da fare».
//
// ⚠️⚠️ Il difetto che questa prova esiste per fermare, visto sul telefono
// provando davvero: le righe vuote sparivano. `filter(Boolean)` non sa
// distinguere «campo assente» da «riga vuota messa apposta», e il messaggio
// arrivava tutto attaccato in un blocco unico — su WhatsApp, dove si legge di
// corsa, e' la differenza fra un avviso e un muro di testo.
import { testoAvviso } from '../src/lib/avviso-pagamento-da-fare'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const pieno = testoAvviso({ chi: 'Battistella fioreria srl', importo: 80, valuta: 'EUR',
  ordine: '#2785', causale: 'Ordine #2785', da: 'Nicolò' })
console.log(pieno.split('\n').map(r => '    | ' + r).join('\n'))
console.log()

const righe = pieno.split('\n')
prova('comincia dicendo che cos e', righe[0] === 'Nuovo pagamento da fare.')
prova('riga vuota dopo il titolo', righe[1] === '', JSON.stringify(righe[1]))
prova('riga vuota prima del link', righe[righe.length - 2] === '')
prova('c e a chi va', pieno.includes('A: Battistella fioreria srl'))
// ⚠️ Lo spazio prima di € e uno spazio UNIFICATORE (U+00A0), non uno normale:
// cercandolo con uno spazio semplice la prova falliva su un testo giusto.
prova('c e quanto, scritto in euro', /80,00\s€/.test(pieno))
prova('c e l ordine', pieno.includes('Ordine: #2785'))
// ⚠️ La causale «Ordine #2785» non si ripete: e la stessa cosa gia scritta
// sopra, e una riga che ripete si legge come una riga in piu da capire.
prova('la causale che ripete l ordine non si scrive', !pieno.includes('Causale:'))

console.log('\n══ QUANDO MANCA QUALCOSA ══')
const magro = testoAvviso({ chi: 'Tizio', importo: 0, valuta: '', ordine: '', causale: '', da: '' })
console.log(magro.split('\n').map(r => '    | ' + r).join('\n'))
prova('senza importo non scrive «Importo:»', !magro.includes('Importo:'))
prova('senza ordine non scrive «Ordine:»', !magro.includes('Ordine:'))
prova('ma le righe vuote restano', magro.split('\n')[1] === '' && magro.split('\n')[3] === '')
prova('e il nome c e sempre', magro.includes('A: Tizio'))

const conCausale = testoAvviso({ chi: 'X', importo: 10, valuta: 'EUR', ordine: '#1', causale: 'acconto', da: '' })
prova('una causale DIVERSA dall ordine si scrive', conCausale.includes('Causale: acconto'))

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
