// Casi di prova del riconoscimento del numero d'ordine nel diario.
//   npx tsx scripts/prova-diario.mts
import { numeroInTesta } from '../src/lib/diario'

const casi: [string, string, string][] = [
  ['12562 da fare 16 luglio', '#12562', 'da fare 16 luglio'],
  ['2506 ital fiori blumen bolzano pagamento su cs, per oggi', '#2506', 'ital fiori blumen bolzano pagamento su cs, per oggi'],
  ['#1741 sollecitare pagamento', '#1741', 'sollecitare pagamento'],
  ['1700 fanno loro, mandano dati a torta pronta', '#1700', 'fanno loro, mandano dati a torta pronta'],
  ['12457: attesa via libera dal cliente', '#12457', 'attesa via libera dal cliente'],
  ['chiamare il fornitore di Bolzano', '', 'chiamare il fornitore di Bolzano'],
  ['16 luglio consegna a Milano', '', '16 luglio consegna a Milano'],
  ['ordine da rifare per il 22', '', 'ordine da rifare per il 22'],
]

let falliti = 0
for (const [riga, numero, resto] of casi) {
  const r = numeroInTesta(riga)
  // ⚠️ «16 luglio consegna a Milano» NON deve diventare l'ordine #16: sotto le
  // tre cifre non si prende niente, ed è il motivo per cui il filtro esiste.
  const ok = r.numero === numero && r.resto === resto
  if (!ok) falliti++
  console.log(`${ok ? 'OK  ' : 'NO  '} «${riga}» → numero=${r.numero || '(nessuno)'} | ${r.resto}`)
}
console.log(falliti === 0 ? `\nTutti e ${casi.length} i casi passano.` : `\n${falliti} FALLITI`)
process.exit(falliti === 0 ? 0 : 1)
