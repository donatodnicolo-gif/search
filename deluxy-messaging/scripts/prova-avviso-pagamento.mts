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


// ══════════════════════════════════════════════════════════════════════════
// L IBAN E IL LINK
// ⚠️ L IBAN si scrive PER INTERO: negli elenchi a schermo si mostrano le ultime
// quattro apposta, ma qui il senso del messaggio e poter pagare DAL TELEFONO
// senza aprire l app — un IBAN a meta costringe ad aprirla lo stesso.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n══ COME SI PAGA, NEL MESSAGGIO ══')
{
  const conIban = testoAvviso({ chi: 'X', importo: 80, valuta: 'EUR', ordine: '#2785', causale: '', da: '',
    metodo: 'iban', iban: 'IT60X0542811101000000123456', link: 'https://esempio/pagamenti?richiesta=abc' })
  console.log(conIban.split('\n').map(r => '    | ' + r).join('\n'))
  prova('l IBAN c e per intero', conIban.includes('IT60X0542811101000000123456'))
  prova('  e non accorciato', !conIban.includes('…'))
  prova('il link porta su QUELLA riga', conIban.includes('?richiesta=abc'))
}
{
  const conLink = testoAvviso({ chi: 'X', importo: 40, valuta: 'EUR', ordine: '', causale: 'acconto', da: '',
    metodo: 'link', riferimento: 'https://pay.esempio/abc' })
  prova('su metodo «link» si scrive il link di pagamento', conLink.includes('Link di pagamento: https://pay.esempio/abc'))
  prova('  e NON compare un IBAN vuoto', !conLink.includes('IBAN'))
  // ⚠️ Senza APP_URL il link non si inventa: si dice a parole dove andare.
  prova('senza link si dice dove andare a parole', conLink.includes('Customer Service → Pagamenti'))
}
{
  const paypal = testoAvviso({ chi: 'X', importo: 10, valuta: 'EUR', ordine: '', causale: '', da: '',
    metodo: 'paypal', riferimento: 'tizio@esempio.it' })
  prova('PayPal si scrive come PayPal', paypal.includes('PayPal: tizio@esempio.it'))
}
{
  const nudo = testoAvviso({ chi: 'X', importo: 10, valuta: 'EUR', ordine: '', causale: '', da: '', metodo: 'iban' })
  prova('metodo iban ma IBAN mancante: nessuna riga vuota', !nudo.includes('IBAN'))
  prova('  e il messaggio resta leggibile', nudo.split('\n').filter(r => r === '').length <= 2)
}
console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
