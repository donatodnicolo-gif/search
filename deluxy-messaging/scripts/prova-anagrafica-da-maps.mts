// DA GOOGLE MAPS A UN CONTATTO DI ANAGRAFICHE.
//
//   npx tsx scripts/prova-anagrafica-da-maps.mts
//
// ⚠️ Nessuna rete: si provano le due traduzioni pure — i pezzi dell'indirizzo e
// il contatto che ne esce. I dati di partenza sono la forma VERA delle due API
// di Google (nuova e vecchia), non una forma inventata comoda da far passare
// ([[trappola-parser-provato-sui-dati-veri]]).
import { pezziIndirizzo } from '../src/lib/maps-fornitori'
import type { DettaglioMaps } from '../src/lib/maps-fornitori'
import { contattoDaMaps, categoriaDaTipi, noteDaMaps } from '../src/lib/anagrafica-da-maps'

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

function luogo(p: Partial<DettaglioMaps>): DettaglioMaps {
  return {
    id: '', nome: '', indirizzo: '', via: '', cap: '', citta: '', provincia: '',
    regione: '', paese: '', telefono: '', sito: '', mappa: '', voto: null,
    recensioni: 0, chiuso: false, tipi: [], ...p,
  }
}

console.log('\n— i pezzi dell’indirizzo, forma API NUOVA (longText/shortText) —')
// Come li manda `places.googleapis.com/v1/places`.
const nuova = [
  { longText: '7', shortText: '7', types: ['street_number'] },
  { longText: 'Via Salvatore Trinchese', shortText: 'Via Salvatore Trinchese', types: ['route'] },
  { longText: 'Lecce', shortText: 'Lecce', types: ['locality', 'political'] },
  { longText: 'Provincia di Lecce', shortText: 'LE', types: ['administrative_area_level_2', 'political'] },
  { longText: 'Puglia', shortText: 'Puglia', types: ['administrative_area_level_1', 'political'] },
  { longText: 'Italia', shortText: 'IT', types: ['country', 'political'] },
  { longText: '73100', shortText: '73100', types: ['postal_code'] },
]
prova('via col civico DOPO, all’italiana', pezziIndirizzo(nuova).via, 'Via Salvatore Trinchese 7')
prova('CAP', pezziIndirizzo(nuova).cap, '73100')
prova('città', pezziIndirizzo(nuova).citta, 'Lecce')
prova('provincia BREVE', pezziIndirizzo(nuova).provincia, 'LE')
prova('regione LUNGA', pezziIndirizzo(nuova).regione, 'Puglia')
prova('paese', pezziIndirizzo(nuova).paese, 'Italia')

console.log('\n— stessa cosa, forma API VECCHIA (long_name/short_name) —')
const vecchia = [
  { long_name: '12', short_name: '12', types: ['street_number'] },
  { long_name: 'Corso Buenos Aires', short_name: 'Corso Buenos Aires', types: ['route'] },
  { long_name: 'Milano', short_name: 'Milano', types: ['locality', 'political'] },
  { long_name: 'Città Metropolitana di Milano', short_name: 'MI', types: ['administrative_area_level_2'] },
  { long_name: 'Lombardia', short_name: 'Lombardia', types: ['administrative_area_level_1'] },
  { long_name: 'Italia', short_name: 'IT', types: ['country'] },
  { long_name: '20124', short_name: '20124', types: ['postal_code'] },
]
prova('via', pezziIndirizzo(vecchia).via, 'Corso Buenos Aires 12')
prova('città', pezziIndirizzo(vecchia).citta, 'Milano')
prova('provincia', pezziIndirizzo(vecchia).provincia, 'MI')

console.log('\n— i casi in cui `locality` NON c’è —')
prova(
  'ripiego su administrative_area_level_3',
  pezziIndirizzo([
    { longText: 'Sesto Fiorentino', types: ['administrative_area_level_3', 'political'] },
  ]).citta,
  'Sesto Fiorentino'
)
prova('nessun pezzo: tutto vuoto, niente inventato', pezziIndirizzo([]), {
  via: '', cap: '', citta: '', provincia: '', regione: '', paese: '',
})
prova(
  'solo il civico, senza via: non si finge un indirizzo',
  pezziIndirizzo([{ longText: '7', types: ['street_number'] }]).via,
  '7'
)

console.log('\n— il mestiere dai tipi —')
prova('florist', categoriaDaTipi(['florist', 'store']), 'FIORISTA')
prova('il primo che risponde vince', categoriaDaTipi(['store', 'point_of_interest', 'restaurant']), 'RISTORANTE')
prova('⚠️ bakery NON è pasticceria: in Italia è anche il panificio', categoriaDaTipi(['bakery']), '')
prova('tipi sconosciuti: niente', categoriaDaTipi(['point_of_interest', 'establishment']), '')
prova('nessun tipo', categoriaDaTipi([]), '')

console.log('\n— il contatto intero —')
const vallauris = luogo({
  id: 'ChIJ_vallauris_finto',
  nome: 'Fleurs de Vallauris',
  indirizzo: '3 Avenue Georges Clemenceau, 06220 Vallauris, Francia',
  via: 'Avenue Georges Clemenceau 3',
  cap: '06220',
  citta: 'Vallauris',
  provincia: 'Alpes-Maritimes',
  regione: "Provence-Alpes-Côte d'Azur",
  paese: 'Francia',
  telefono: '+33 4 93 00 00 00',
  sito: 'https://esempio.fr',
  mappa: 'https://maps.google.com/?cid=1',
  voto: 4.6,
  recensioni: 218,
  tipi: ['florist', 'store'],
})
const c = contattoDaMaps(vallauris)
prova('nome', c.nome, 'Fleurs de Vallauris')
prova('città', c.citta, 'Vallauris')
prova('indirizzo = via e civico, senza ripetere città e CAP', c.indirizzo, 'Avenue Georges Clemenceau 3')
prova('telefono', c.telefono, '+33 4 93 00 00 00')
prova('categoria dai tipi', c.categoria, 'FIORISTA')
prova('regione', c.regione, "Provence-Alpes-Côte d'Azur")
prova(
  '⚠️ «Alpes-Maritimes» NON diventa una provincia: non è una sigla di due lettere',
  c.provincia,
  undefined
)
prova(
  'note: sito, CAP, paese estero, voto di GOOGLE, scheda e place id',
  c.note,
  [
    'Da Google Maps:',
    'Sito: https://esempio.fr',
    'CAP: 06220',
    'Paese: Francia',
    'Google Maps: 4.6/5 su 218 recensioni',
    'Scheda: https://maps.google.com/?cid=1',
    'Google place id: ChIJ_vallauris_finto',
  ].join('\n')
)

console.log('\n— le precedenze —')
prova(
  'il mestiere del NOSTRO ordine batte i tipi di Google',
  contattoDaMaps(vallauris, 'PASTICCERIA').categoria,
  'PASTICCERIA'
)
prova(
  'provincia italiana: la sigla di Google si prende',
  contattoDaMaps(luogo({ nome: 'x', citta: 'Lecce', provincia: 'LE' })).provincia,
  'LE'
)
prova(
  'senza sigla da Google si ricava dalla città, se è certa',
  contattoDaMaps(luogo({ nome: 'x', citta: 'Firenze' })).provincia,
  'FI'
)
prova(
  'città che non dà una sigla certa: nessuna provincia inventata',
  contattoDaMaps(luogo({ nome: 'x', citta: 'Borgo Inventato' })).provincia,
  undefined
)

console.log('\n— i campi assenti NON si mandano —')
// ⚠️ Mandare `citta: ''` proverebbe a CANCELLARE la città che il registro ha
// già; non mandarla la lascia stare. Le due cose non si somigliano nemmeno.
prova('solo il nome', contattoDaMaps(luogo({ nome: 'Tizio' })), { nome: 'Tizio' })
prova('niente note se non c’è niente da dire', noteDaMaps(luogo({ nome: 'Tizio' })), '')

console.log('\n— roba storta che arriva da fuori —')
prova(
  'voto come stringa: non solleva, e la riga non mente',
  noteDaMaps(luogo({ voto: '4.6' as unknown as number, recensioni: 10 })),
  'Da Google Maps:\nGoogle Maps: 4.6/5 su 10 recensioni'
)
prova(
  'zero recensioni: non si scrive «su 0 recensioni»',
  noteDaMaps(luogo({ voto: 5, recensioni: 0 })),
  'Da Google Maps:\nGoogle Maps: 5.0/5'
)
prova(
  'tipi che non sono un elenco: nessun giro sulle lettere',
  categoriaDaTipi('florist' as unknown as string[]),
  ''
)
prova(
  'una nota lunghissima si taglia',
  (contattoDaMaps(luogo({ nome: 'x', sito: 'https://' + 'a'.repeat(900) })).note ?? '').length < 600,
  true
)
prova('chiuso definitivamente: lo dice', noteDaMaps(luogo({ chiuso: true })), 'Da Google Maps:\nGoogle Maps lo dà come CHIUSO DEFINITIVAMENTE.')

console.log(`\n${fatte - rotte}/${fatte} passate${rotte ? ` — ${rotte} ROTTE` : ''}`)
process.exit(rotte ? 1 : 0)
