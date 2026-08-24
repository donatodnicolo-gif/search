// Prova della lettura della citta da un indirizzo di Google Maps.
//
// ⚠️⚠️ Il caso che questa prova esiste per fermare: «Via Salvatore Trinchese, 7,
// 73100 Lecce LE» letto come citta «7». Succedeva prendendo «il penultimo
// pezzo», perche' l API VECCHIA separa il civico con una virgola e non mette
// «, Italia» in fondo, mentre quella NUOVA si. Contare le virgole vuol dire
// dipendere da quale delle due API ha risposto — e sono due.
import { cittaDa } from '../src/lib/maps-fornitori'

let male = 0
const casi: [string, string][] = [
  // usciti davvero dalla ricerca «pasticceria Lecce» (API vecchia)
  ['Via Salvatore Trinchese, 7, 73100 Lecce LE', 'Lecce'],
  ['Via M. Renato Imbriani, 53, 73100 Lecce LE', 'Lecce'],
  ['Via G. Oberdan, 129, 73100 Lecce LE', 'Lecce'],
  // formato dell API nuova, col paese in fondo
  ['Via Roma, 12, 20121 Milano MI, Italia', 'Milano'],
  ['Piazza Duomo 1, 50122 Firenze FI, Italy', 'Firenze'],
  // citta con due parole e sigla
  ['Corso Garibaldi 3, 42121 Reggio Emilia RE, Italia', 'Reggio Emilia'],
  // senza CAP: si prende l ultimo pezzo utile, non il civico
  ['Via Verdi, Napoli, Italia', 'Napoli'],
  ['Via Verdi, 22', ''],
  ['', ''],
]
for (const [dentro, atteso] of casi) {
  const avuto = cittaDa(dentro)
  const ok = avuto === atteso
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} «${dentro}» → «${avuto}»${ok ? '' : `  (atteso «${atteso}»)`}`)
}
console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
