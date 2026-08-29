// LE REGOLE DI CONSEGNA: marchio prima, città poi. (28/08/2026)
//   npx tsx scripts/prova-regole-consegna.mts
import { regolaConsegna } from '../src/lib/regole-consegna'

let ok = 0, ko = 0
function p(nome: string, r: { prezzo: number; certa: boolean }, prezzo: number, certa: boolean) {
  const buono = r.prezzo === prezzo && r.certa === certa
  console.log(`  ${buono ? '✓' : '✗'} ${nome}${buono ? '' : ` — atteso ${prezzo}€/${certa}, avuto ${r.prezzo}€/${r.certa}`}`)
  buono ? ok++ : ko++
}

console.log('\n— i marchi a prezzo fisso, in qualunque città —')
p('Flowers a Milano → gratis', regolaConsegna('FLowers', 'Milano'), 0, true)
p('Flowers a Palermo → gratis', regolaConsegna('Deluxy Flowers', 'Palermo'), 0, true)
p('Cake a Roma → 10 (non 25)', regolaConsegna('Cake', 'Roma'), 10, true)
p('Cake senza città → 10', regolaConsegna('cakedesign', ''), 10, true)

console.log('\n— Deluxy, a città —')
p('Deluxy Milano → 15', regolaConsegna('Deluxy', 'Milano'), 15, true)
p('Deluxy Milano (MI) → 15', regolaConsegna('Deluxy', 'Milano (MI)'), 15, true)
p('Deluxy Roma → 25', regolaConsegna('Deluxy', 'Roma'), 25, true)
p('Deluxy Firenze → 25', regolaConsegna('Deluxy', 'FIRENZE'), 25, true)
p('Deluxy Rome (inglese) → 25', regolaConsegna('DELUXY', 'Rome'), 25, true)

console.log('\n— Deluxy fuori regola: non si indovina —')
p('Deluxy Napoli → nessuna regola', regolaConsegna('Deluxy', 'Napoli'), 0, false)
p('Deluxy senza città → nessuna regola', regolaConsegna('Deluxy', ''), 0, false)
// ⚠️ un nome che contiene «roma» per caso NON deve valere 25
p('Deluxy Romano di Lombardia → NON è Roma', regolaConsegna('Deluxy', 'Romano di Lombardia'), 0, false)

console.log(`\n${ok}/${ok + ko} passate`)
process.exit(ko ? 1 : 0)
