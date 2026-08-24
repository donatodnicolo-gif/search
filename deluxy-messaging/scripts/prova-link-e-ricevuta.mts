// Prova del link a un ordine e del nome del file della ricevuta.
//
// ⚠️⚠️ I due casi che questa prova esiste per fermare, tutti e due misurati:
//  1. il link agli ordini TOGLIEVA il cancelletto, e «2780» pescava anche
//     #12780 — un ordine di un altro negozio e di un altro cliente;
//  2. il nome del file della ricevuta finiva in un Content-Disposition cosi
//     com era: virgolette o un a-capo dentro quell intestazione la spezzano.
import { linkOrdine, numeroConCancelletto } from '../src/lib/link-ordine'
import { nomeFileRicevuta } from '../src/lib/metodo-pagamento'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

console.log('══ IL LINK ALL ORDINE ══')
prova('il cancelletto resta', linkOrdine('#2785') === '/ordini-globali?q=%232785', linkOrdine('#2785'))
prova('e si aggiunge se manca', linkOrdine('2785') === '/ordini-globali?q=%232785', linkOrdine('2785'))
prova('doppio cancelletto: uno solo', numeroConCancelletto('##2785') === '#2785')
prova('spazi intorno: puliti', numeroConCancelletto('  2785 ') === '#2785')
// ⚠️ Il punto di tutto: «#2785» NON sta dentro «#12785».
prova('«#2785» non combacia con «#12785»', !'#12785'.includes('#2785'))
prova('mentre «2785» si — ed era il difetto', '#12785'.includes('2785'))
prova('senza numero, nessun link', linkOrdine('') === '' && linkOrdine('   ') === '')

console.log('\n══ IL NOME DEL FILE DELLA RICEVUTA ══')
prova('un nome buono si tiene', nomeFileRicevuta('bonifico-marzo.pdf', 'Ordine #2785', 'application/pdf') === 'bonifico-marzo.pdf')
prova('senza nome si usa la causale', nomeFileRicevuta('', 'Ordine #2785', 'image/png') === 'Ordine-2785.png',
  nomeFileRicevuta('', 'Ordine #2785', 'image/png'))
prova('jpeg diventa jpg', nomeFileRicevuta('', 'x', 'image/jpeg').endsWith('.jpg'), nomeFileRicevuta('', 'x', 'image/jpeg'))
{
  // ⚠️ Il caso cattivo: virgolette e a-capo spezzerebbero l intestazione HTTP.
  const brutto = nomeFileRicevuta('ric"evuta\r\nX-Altro: si.png', 'c', 'image/png')
  prova('via le virgolette', !brutto.includes('"'), brutto)
  prova('via gli a-capo', !/[\r\n]/.test(brutto), JSON.stringify(brutto))
  prova('via i due punti dell intestazione finta', !brutto.includes(':'), brutto)
}
prova('via le barre dei percorsi', !nomeFileRicevuta('../../etc/passwd.png', 'c', 'image/png').includes('/'),
  nomeFileRicevuta('../../etc/passwd.png', 'c', 'image/png'))
prova('un nome lunghissimo si accorcia', nomeFileRicevuta('a'.repeat(300) + '.png', 'c', 'image/png').length <= 84)
prova('un tipo che non conosciamo non finge un estensione', nomeFileRicevuta('', 'c', 'application/zip').endsWith('.bin'))

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
