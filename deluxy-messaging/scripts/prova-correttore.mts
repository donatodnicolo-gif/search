// Casi di prova del correttore di bozze.
//   npx tsx scripts/prova-correttore.mts
//
// ⚠️ Qui non si chiama nessun modello: si prova **il filtro**, cioè la parte
// che decide quali proposte dell'AI si possono mostrare a una persona. È lì che
// si fa il danno vero — una correzione inventata sul cognome di un cliente, o
// un CAP «corretto» in un indirizzo di consegna.
import { applica, compareNelTesto, filtra, maschera } from '../src/lib/refusi'

let falliti = 0
function prova(nome: string, avuto: unknown, atteso: unknown) {
  const ok = JSON.stringify(avuto) === JSON.stringify(atteso)
  if (!ok) falliti++
  console.log(
    `${ok ? 'OK  ' : 'NO  '} ${nome}${ok ? '' : `\n     avuto  ${JSON.stringify(avuto)}\n     atteso ${JSON.stringify(atteso)}`}`
  )
}

console.log('── La parola c’è davvero? ──')
prova('parola intera', compareNelTesto('Good mornign, this is Federica', 'mornign'), true)
// ⚠️ Il caso che conta: una proposta inventata non deve passare.
prova('parola inventata', compareNelTesto('Good morning', 'mornign'), false)
// ⚠️ «ora» dentro «lavora» non è «ora»: correggerla spaccherebbe la parola.
prova('pezzo dentro un’altra parola', compareNelTesto('domani si lavora', 'ora'), false)
prova('proposta con lo spazio', compareNelTesto('Ho necessità tutta via di', 'tutta via'), true)
prova('maiuscola/minuscola non conta', compareNelTesto('Mornign a tutti', 'mornign'), true)

console.log('\n── Il filtro ──')
const testo = 'Good mornign, we recived your order for Via Bellaria 16, 21018 Sesto Calende'
prova(
  'tiene i due refusi veri',
  filtra(testo, [
    { sbagliato: 'mornign', giusto: 'morning' },
    { sbagliato: 'recived', giusto: 'received' },
  ]),
  [
    { sbagliato: 'mornign', giusto: 'morning' },
    { sbagliato: 'recived', giusto: 'received' },
  ]
)
// ⚠️⚠️ I quattro casi per cui il filtro esiste.
prova(
  'butta la parola che nel testo non c’è',
  filtra(testo, [{ sbagliato: 'consegnsa', giusto: 'consegna' }]),
  []
)
prova(
  'butta il «refuso» sui numeri (è un CAP)',
  filtra(testo, [{ sbagliato: '21018', giusto: '21081' }]),
  []
)
prova(
  'butta la correzione uguale all’originale',
  filtra(testo, [{ sbagliato: 'order', giusto: 'Order' }]),
  []
)
prova(
  'butta il doppione',
  filtra(testo, [
    { sbagliato: 'mornign', giusto: 'morning' },
    { sbagliato: 'MORNIGN', giusto: 'morning' },
  ]),
  [{ sbagliato: 'mornign', giusto: 'morning' }]
)
// ⚠️ Sei bandierine rosse non sono sei refusi: è un testo che il modello non ha
// capito. Meglio non dire niente che insegnare a mandare senza leggere.
prova(
  'sei proposte = nessuna',
  filtra('a bb ccc dddd eeeee ffffff gggggg', [
    { sbagliato: 'bb', giusto: 'be' },
    { sbagliato: 'ccc', giusto: 'cca' },
    { sbagliato: 'dddd', giusto: 'ddda' },
    { sbagliato: 'eeeee', giusto: 'eeeea' },
    { sbagliato: 'ffffff', giusto: 'fffffa' },
    { sbagliato: 'gggggg', giusto: 'ggggga' },
  ]),
  []
)

console.log('\n── Quello che il modello non deve nemmeno vedere ──')
// ⚠️ Link, email, numeri d'ordine, telefoni e IBAN sono la fonte principale dei
// falsi allarmi: si mascherano prima di mandare il testo.
prova(
  'link, mail, ordine e telefono spariscono',
  maschera('Scrivi a cs@deluxy.it o su https://deluxy.it per #2529, tel +393498853209'),
  'Scrivi a · o su · per ·, tel ·'
)
prova('il testo normale non si tocca', maschera('Buongiorno, la consegna è oggi'), 'Buongiorno, la consegna è oggi')

console.log('\n── La correzione applicata ──')
prova(
  'sostituisce le due parole',
  applica('Good mornign, we recived your order', [
    { sbagliato: 'mornign', giusto: 'morning' },
    { sbagliato: 'recived', giusto: 'received' },
  ]),
  'Good morning, we received your order'
)
// ⚠️ La maiuscola iniziale si conserva: «Mornign» → «Morning», non «morning».
prova(
  'conserva la maiuscola',
  applica('Mornign a tutti', [{ sbagliato: 'mornign', giusto: 'morning' }]),
  'Morning a tutti'
)
// ⚠️ Solo la PRIMA occorrenza: se la parola è scritta due volte e una sola è
// sbagliata, correggerle entrambe rompe la frase giusta.
prova(
  'tocca solo la prima occorrenza',
  applica('consegna oggi, consegna domani', [{ sbagliato: 'consegna', giusto: 'consegne' }]),
  'consegne oggi, consegna domani'
)
prova(
  'non tocca niente se la parola non c’è',
  applica('tutto giusto', [{ sbagliato: 'sbagliato', giusto: 'corretto' }]),
  'tutto giusto'
)

console.log(falliti === 0 ? '\nTutti i casi passano.' : `\n${falliti} FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
