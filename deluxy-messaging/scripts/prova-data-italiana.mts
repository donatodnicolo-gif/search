// Prova della regola del «/» e di come si scrive una data in una riga di diario.
//
// ⚠️ Il caso che questa prova esiste per fermare: «27/08». Se la barra dentro
// una data in cifre aprisse il calendario, la funzione diventerebbe un dispetto
// proprio per chi scrive le date — cioè per tutti quelli che usano il diario.
//
//   npx tsx scripts/prova-data-italiana.mts
import {
  posizioneBarraComando,
  caselleDelMese,
  nomeMese,
  piuGiorni,
  scriviData,
  stessoGiorno,
} from '../src/lib/data-italiana'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? '  ok ' : '  NO '} ${nome}${extra ? ' — ' + extra : ''}`)
}

console.log('=== DOVE LA BARRA È UN COMANDO ===')
const dove = (prima: string, dopo: string) => posizioneBarraComando(prima, dopo)
prova('campo vuoto', dove('', '/') === 0)
prova('dopo uno spazio, in fondo', dove('12562 da fare ', '12562 da fare /') === 14)
// ⚠️⚠️ Il caso segnalato dall'utente mentre CORREGGEVA una nota: si seleziona
// «domani» e si scrive «/» al suo posto, in MEZZO alla riga. La prima versione
// guardava solo la fine del testo, e qui non si apriva mai.
prova(
  'al posto di una parola selezionata, IN MEZZO',
  dove('chiamare domani alle 9!', 'chiamare / alle 9!') === 9,
  String(dove('chiamare domani alle 9!', 'chiamare / alle 9!'))
)
prova('inserita in mezzo, senza selezione', dove('chiamare  alle 9', 'chiamare / alle 9') === 9)
prova('NON dentro una data in cifre', dove('27', '27/') === -1, '«27/08»')
prova('NON dentro «e/o»', dove('e', 'e/') === -1)
prova('NON dopo una lettera', dove('ciao', 'ciao/') === -1)
prova('NON attaccata a una parola, in mezzo', dove('chiamare domani', 'chiamare/ domani') === -1)
prova('NON incollando un testo con la barra', dove('', 'nota del 27/08') === -1)
prova('NON cancellando', dove('da fare /', 'da fare ') === -1)
prova('NON due barre di fila', dove('da fare /', 'da fare //') === -1)
prova('NON se il testo prima è cambiato', dove('abc', 'abd/') === -1)

console.log('\n=== COME SI SCRIVE LA DATA ===')
const oggi = new Date(2026, 7, 26) // 26 agosto 2026
prova('giorno e mese a parole', scriviData(new Date(2026, 6, 16), oggi) === '16 luglio', scriviData(new Date(2026, 6, 16), oggi))
prova('niente zero davanti', scriviData(new Date(2026, 8, 2), oggi) === '2 settembre', scriviData(new Date(2026, 8, 2), oggi))
prova("niente anno se è quest'anno", !scriviData(new Date(2026, 11, 27), oggi).includes('2026'), scriviData(new Date(2026, 11, 27), oggi))
prova("l'anno c'è se è un altro", scriviData(new Date(2027, 0, 5), oggi) === '5 gennaio 2027', scriviData(new Date(2027, 0, 5), oggi))
prova("l'anno c'è anche indietro", scriviData(new Date(2025, 11, 27), oggi) === '27 dicembre 2025', scriviData(new Date(2025, 11, 27), oggi))

console.log('\n=== IL MESE, LUNEDÌ PER PRIMO ===')
// Agosto 2026: il 1° è un sabato → cinque caselle vuote (lun, mar, mer, gio, ven).
const ago = caselleDelMese(2026, 7)
prova('agosto 2026 comincia con 5 caselle vuote', ago.slice(0, 5).every((c) => c === null) && ago[5] !== null, String(ago.findIndex((c) => c !== null)))
prova('agosto ha 31 giorni', ago.filter(Boolean).length === 31, String(ago.filter(Boolean).length))
prova('il primo giorno è il 1', (ago.find(Boolean) as Date).getDate() === 1)
// Febbraio 2028 è bisestile: 29 giorni.
prova('febbraio 2028 ha 29 giorni', caselleDelMese(2028, 1).filter(Boolean).length === 29)
// Marzo 2026: il 1° è una domenica → sei caselle vuote (la domenica va in fondo).
prova('la domenica sta in fondo, non in testa', caselleDelMese(2026, 2).findIndex((c) => c !== null) === 6)

console.log('\n=== SPOSTARSI ===')
const d = new Date(2026, 7, 31)
prova('un giorno avanti cambia mese', stessoGiorno(piuGiorni(d, 1), new Date(2026, 8, 1)))
prova("non tocca l'originale", stessoGiorno(d, new Date(2026, 7, 31)))
prova('una settimana indietro', stessoGiorno(piuGiorni(new Date(2026, 8, 3), -7), new Date(2026, 7, 27)))
prova('i mesi hanno i nomi giusti', nomeMese(0) === 'gennaio' && nomeMese(11) === 'dicembre')

console.log(male ? `\n${male} PROVE FALLITE` : '\nTutte le prove passate.')
process.exit(male ? 1 : 0)
