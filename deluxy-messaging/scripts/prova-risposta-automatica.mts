// LE DUE REGOLE DEI MESSAGGI AUTOMATICI: niente segnaposti, e si dichiarano.
//
//   npx tsx scripts/prova-risposta-automatica.mts
//
// ⚠️ Nascono dallo stesso caso vero del 27/08/2026: a un cliente su WhatsApp è
// arrivato «Dear Client, my name is [Your Name] from Deluxy…» — un segnaposto
// non riempito, dentro un messaggio che si presentava come una persona.
import {
  segnapostoNonRiempito,
  avvisoAutomatico,
  conAvvisoAutomatico,
} from '../src/lib/risposta-automatica'

let fatte = 0
let rotte = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  fatte++
  if (JSON.stringify(avuto) !== JSON.stringify(atteso)) {
    rotte++
    console.log(`  ✗ ${nome}\n      atteso: ${JSON.stringify(atteso)}\n      avuto:  ${JSON.stringify(avuto)}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n— il segnaposto non riempito si RICONOSCE —')
// ⚠️ Il caso vero, parola per parola.
prova(
  '⚠️ il messaggio partito davvero',
  segnapostoNonRiempito('Dear Client, my name is [Your Name] from Deluxy. Please feel free…'),
  '[Your Name]'
)
prova('graffe doppie', segnapostoNonRiempito('Ciao {{nome}}, il tuo ordine'), '{{nome}}')
prova('graffe singole', segnapostoNonRiempito('Ciao {nome_cliente}!'), '{nome_cliente}')
prova('angolari', segnapostoNonRiempito('Consegna il <data prevista>'), '<data prevista>')
prova('in mezzo a un testo lungo', segnapostoNonRiempito('a'.repeat(300) + ' [Brand] ' + 'b'.repeat(300)), '[Brand]')

console.log('\n— e quello che NON è un segnaposto —')
// ⚠️ Sbagliare in questo verso costa una risposta buona buttata via, quindi le
// forme che assomigliano ma non lo sono vanno lasciate passare.
prova('un numero d’ordine fra quadre', segnapostoNonRiempito('Il tuo ordine [1234] è partito'), '')
prova('una faccina', segnapostoNonRiempito('Grazie <3'), '')
prova('una quadra aperta e mai chiusa', segnapostoNonRiempito('Costa 20 [euro circa, ti confermo'), '')
prova('un testo normale', segnapostoNonRiempito('Buongiorno, la consegna è prevista per domani.'), '')
prova('vuoto', segnapostoNonRiempito(''), '')
prova('parentesi tonde', segnapostoNonRiempito('Consegna (entro le 18) confermata'), '')

console.log('\n— si dichiara che risponde una macchina —')
prova('italiano', avvisoAutomatico('italiano').includes('assistente automatico'), true)
prova('inglese', avvisoAutomatico('inglese').includes('automated assistant'), true)
prova('francese', avvisoAutomatico('francese').includes('assistant automatique'), true)
// ⚠️ Lingua sconosciuta = italiano E inglese: chi ha scritto in una lingua che
// non riconosciamo quasi certamente non legge l'italiano.
prova('lingua sconosciuta: due lingue', avvisoAutomatico('swahili').split('\n').length, 2)
prova('lingua vuota: due lingue', avvisoAutomatico('').split('\n').length, 2)
// ⚠️ Dice anche COSA SUCCEDE DOPO: senza, «sono automatico» si legge come «non
// avrai risposta», ed è il momento in cui un cliente se ne va.
prova('dice che poi risponde una persona', avvisoAutomatico('italiano').includes('persona'), true)

console.log('\n— come si attacca alla risposta —')
const r = conAvvisoAutomatico('La consegna è prevista per domani.', 'italiano')
prova('la risposta resta PRIMA', r.startsWith('La consegna è prevista per domani.'), true)
prova('separata da una riga vuota', r.includes('domani.\n\n'), true)
prova('e l’avviso è in fondo', r.trimEnd().endsWith('appena rientra.'), true)
// ⚠️ Non due volte: una rilettura o un rinvio non deve accumularlo.
prova('non si aggiunge due volte', conAvvisoAutomatico(r, 'italiano'), r)
prova(
  'nemmeno se la lingua è stata riconosciuta diversamente',
  conAvvisoAutomatico(r, 'inglese'),
  r
)
prova('un testo vuoto resta vuoto', conAvvisoAutomatico('', 'italiano'), '')

console.log('\n— e la regola nel prompt c’è —')
import fs from 'node:fs'
const ai = fs.readFileSync('src/lib/ai.ts', 'utf8')
prova('il punto 6 vieta i segnaposti', ai.includes('6. MAI SEGNAPOSTI'), true)
prova('e vieta di firmarsi con un nome di persona', ai.includes('mai con un nome di persona'), true)
// ⚠️⚠️ La rete SOTTO l'istruzione: un'istruzione nel prompt si può ignorare, e
// il 27/08 è stata ignorata.
prova('e sotto c’è la rete che lo scarta', ai.includes('const segnaposto = segnapostoNonRiempito(d.risposta)'), true)

console.log(`\n${fatte - rotte}/${fatte} passate${rotte ? ` — ${rotte} ROTTE` : ''}`)
process.exit(rotte ? 1 : 0)
