// Prova dell ordinamento della ricerca fornitori.
//
// ⚠️⚠️ I due casi che questa prova esiste per fermare, tutti e due misurati:
//  1. cercando «pasticceria» per una consegna a LECCE, in cima uscivano le
//     pasticcerie di Firenze, Roma e Siena — la zona restringeva solo Maps;
//  2. un risultato di Google Maps in mezzo ai nostri: non lo conosciamo, non
//     sappiamo se risponde ne se fattura, e con la fretta si sceglie quello.
import { fornitoreVuoto, punteggio, unisci, diMestiere, cosaSappiamo, type FornitoreTrovato } from '../src/lib/cerca-fornitore'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const f = (p: Partial<FornitoreTrovato>): FornitoreTrovato => ({ ...fornitoreVuoto(), ...p })

console.log('══ LA ZONA CONTA ANCHE SUI NOSTRI ══')
{
  const lontano = f({ nome: 'Pasticceria Firenze', citta: 'FIRENZE', categoria: 'PASTICCERIA', fonti: ['registro'], corrispondenza: 1 })
  const vicino  = f({ nome: 'Pasticceria Lecce',  citta: 'Lecce',   categoria: 'PASTICCERIA', fonti: ['registro'], corrispondenza: 1 })
  const ordine = unisci([lontano, vicino], 'Lecce')
  prova('con zona Lecce, la pasticceria di Lecce e prima', ordine[0].nome === 'Pasticceria Lecce', ordine.map(x=>x.nome).join(' → '))
  const senza = unisci([lontano, vicino], '')
  prova('senza zona non si inventa una preferenza', senza.length === 2)
  prova('la citta si confronta senza maiuscole', punteggio(vicino, 'LECCE') > punteggio(lontano, 'LECCE'))
}

console.log('\n══ CHI E SEGNATO COME FORNITORE VA PRIMA ══')
{
  const cliente  = f({ nome: 'Rossi Boutique', categoria: 'BOUTIQUE', fonti: ['registro'], corrispondenza: 1 })
  const forn     = f({ nome: 'Rossi Fioristi', categoria: 'FIORISTA', fonti: ['registro'], corrispondenza: 1 })
  const ordine = unisci([cliente, forn])
  prova('il fiorista batte la boutique', ordine[0].nome === 'Rossi Fioristi', ordine.map(x=>x.nome).join(' → '))
  prova('FIORISTA e un mestiere di fornitura', diMestiere('FIORISTA') && diMestiere('fiorista'))
  prova('anche i sinonimi contati nel registro', diMestiere('FIORI') && diMestiere('CIOCCOLATERIA'))
  prova('BOUTIQUE no', !diMestiere('BOUTIQUE'))
  // ⚠️ 340 partner su 1048 sono «DA CLASSIFICARE»: non sono fornitori marcati,
  // ma NON devono sparire — vedi la nota nel codice.
  prova('«DA CLASSIFICARE» non e marcato ma resta in elenco', !diMestiere('DA CLASSIFICARE'))
  const conIgnoti = unisci([cliente, forn, f({ nome: 'Rossi Ignoto', categoria: 'DA CLASSIFICARE', fonti: ['registro'], corrispondenza: 1 })])
  prova('  e infatti sono tre, nessuno nascosto', conIgnoti.length === 3)
}

console.log('\n══ GOOGLE MAPS VA IN FONDO ══')
{
  const nostro = f({ nome: 'Fiori Nostri', fonti: ['registro'], corrispondenza: 1 })
  const maps = f({ nome: 'Fiori Maps', fonti: ['maps'], corrispondenza: 1, voto: 4.9, recensioni: 300, mapsId: 'x' })
  const ordine = unisci([maps, nostro])
  prova('uno di Maps con 4.9 stelle sta sotto a uno nostro', ordine[0].nome === 'Fiori Nostri', ordine.map(x=>x.nome).join(' → '))
  prova('e si dice che non ci abbiamo mai lavorato', cosaSappiamo(maps).includes('mai lavorato'), cosaSappiamo(maps))
  const chiuso = f({ ...maps, chiuso: true })
  prova('uno chiuso definitivamente lo dice', cosaSappiamo(chiuso).includes('CHIUSO'))
  prova('  e va ancora piu in fondo', punteggio(chiuso) < punteggio(maps))
}
{
  // ⚠️ Ma se lo conosciamo GIA e Maps ce lo conferma, non e piu «uno di Maps».
  const misto = unisci([
    f({ nome: 'Pasticceria Nota', fonti: ['pagamento'], pagamenti: 3, iban: 'IT60X0542811101000000123456', corrispondenza: 1 }),
    f({ nome: 'Pasticceria Nota', fonti: ['maps'], mapsId: 'y', corrispondenza: 1 }),
  ])
  prova('uniti in uno solo', misto.length === 1, `${misto.length} righe`)
  prova('e non retrocede in fondo: lo conosciamo', punteggio(misto[0]) > 0, String(punteggio(misto[0])))
}
console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
