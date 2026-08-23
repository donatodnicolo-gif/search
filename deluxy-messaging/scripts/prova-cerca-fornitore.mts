// Prova la ricerca «magari abbiamo già i dati».
//   npx tsx scripts/prova-cerca-fornitore.mts
//
// ⚠️⚠️ Il controllo che conta è UNO: **con più IBAN diversi per lo stesso nome
// non se ne propone nessuno**. Un IBAN proposto per sbaglio non si vede — è una
// stringa che sembra giusta come tutte le altre — e i soldi partono verso un
// conto che non è quello. Da lì non si torna indietro.
//
// ⚠️ Sola lettura: si prova la logica pura, e poi la ricerca vera contro il
// registro Anagrafiche e le nostre tabelle.
import { db } from '../src/lib/db'
import {
  chiaveNome,
  cosaSappiamo,
  ibanAccorciato,
  nomeCorrisponde,
  paroleTrovate,
  punteggio,
  unisci,
  type FornitoreTrovato,
} from '../src/lib/cerca-fornitore'
import { partnerAttivi } from '../src/lib/anagrafiche'

let falliti = 0
function verifica(nome: string, ok: boolean, dettaglio = '') {
  if (!ok) falliti++
  console.log(`  ${ok ? 'OK  ' : 'NO  '} ${nome}${dettaglio ? ' — ' + dettaglio : ''}`)
}

const vuoto: FornitoreTrovato = {
  nome: '',
  ragioneSociale: '',
  citta: '',
  telefono: '',
  email: '',
  iban: '',
  ibanDiversi: 0,
  ordini: 0,
  ultimoCosto: null,
  pagamenti: 0,
  fonti: [],
  stato: '',
  corrispondenza: 0,
}

console.log('\n── Come si confrontano i nomi ──')
verifica('accenti: «Caffè» = «Caffe»', chiaveNome('Caffè') === chiaveNome('Caffe'))
verifica('maiuscole e punti: «F.lli Rossi S.r.l.» = «flli rossi s r l»', chiaveNome('F.lli Rossi S.r.l.') === 'f lli rossi s r l')
verifica('spazi doppi', chiaveNome('  Rossi   Mario ') === 'rossi mario')

console.log('\n── ⚠️ Il rumore del registro, tolto ──')
// Il registro Anagrafiche cerca anche dentro le NOTE: cercando «rossi»
// rispondeva ANTONIO MARRAS, perché nelle sue note c'è «p**rossi**ma
// settimana», e BRIONI e DOLCE & GABBANA per lo stesso motivo. In un elenco da
// cui si sceglie chi PAGARE, quel rumore fa cliccare il nome sbagliato.
verifica(
  '«prossima settimana» nelle note NON è un «Rossi»',
  !nomeCorrisponde({ nome: 'ANTONIO MARRAS', ragioneSociale: '' }, 'rossi')
)
verifica('«Sergio Rossi» sì', nomeCorrisponde({ nome: 'SERGIO ROSSI', ragioneSociale: '' }, 'rossi'))
verifica(
  'la ragione sociale vale come il nome',
  nomeCorrisponde({ nome: 'Da Gino', ragioneSociale: 'Rossi S.r.l.' }, 'rossi')
)
verifica(
  'parole in ordine diverso: «rossi pasticceria» trova «Pasticceria Rossi»',
  nomeCorrisponde({ nome: 'Pasticceria Rossi', ragioneSociale: '' }, 'rossi pasticceria')
)
// ⚠️⚠️ BASTA UNA PAROLA, non tutte. Pretendendole tutte, cercare «Pasticceria
// Rossi» dava ZERO risultati (misurato sul registro vero): nessuna insegna si
// chiama esattamente cosi. Una casella che non trova mai niente si smette di
// usare, e si torna a ribattere gli IBAN a mano.
verifica(
  'una parola su due basta a restare in elenco',
  nomeCorrisponde({ nome: 'Pasticceria Rossi', ragioneSociale: '' }, 'rossi bianchi')
)
verifica(
  'ma chi ha DUE parole conta di piu di chi ne ha una',
  paroleTrovate({ nome: 'Capri Flor', ragioneSociale: '' }, 'capri flor') >
    paroleTrovate({ nome: '100% CAPRI', ragioneSociale: '' }, 'capri flor')
)
verifica(
  'e in cima ci va lui',
  unisci([
    { ...vuoto, nome: '100% CAPRI', corrispondenza: 1, iban: 'IT60X' },
    { ...vuoto, nome: 'Capri Flor', corrispondenza: 2 },
  ])[0].nome === 'Capri Flor'
)

console.log('\n── L’IBAN a schermo ──')
verifica(
  'si mostra accorciato, mai intero',
  ibanAccorciato('IT60 X054 2811 1010 0000 0123 456') === 'IT60…3456',
  ibanAccorciato('IT60 X054 2811 1010 0000 0123 456')
)

console.log('\n── ⚠️ Due IBAN per lo stesso nome ──')
const dueIban = unisci([
  { ...vuoto, nome: 'Pasticceria Rossi', ibanDiversi: 2, pagamenti: 3, fonti: ['pagamento'] },
])
verifica('non se ne propone nessuno', dueIban[0].iban === '')
verifica('ma lo si dice, col numero', cosaSappiamo(dueIban[0]).includes('2 IBAN diversi'), cosaSappiamo(dueIban[0]))

console.log('\n── Unire quello che sappiamo da fonti diverse ──')
const unito = unisci([
  { ...vuoto, nome: 'Pasticceria Rossi', iban: 'IT60X0542811101000000123456', pagamenti: 2, fonti: ['pagamento'] },
  { ...vuoto, nome: 'PASTICCERIA ROSSI', citta: 'Firenze', telefono: '+39055', ordini: 4, ultimoCosto: 130.5, fonti: ['ordine'] },
  { ...vuoto, nome: 'Pasticceria Rossi', ragioneSociale: 'Rossi S.r.l.', email: 'a@b.it', stato: 'Partner', fonti: ['registro'] },
])
verifica('le tre righe diventano una', unito.length === 1, `${unito.length} righe`)
const u = unito[0]
verifica('tiene l’IBAN dei pagamenti', u.iban === 'IT60X0542811101000000123456')
verifica('tiene la città degli ordini', u.citta === 'Firenze')
verifica('tiene la ragione sociale del registro', u.ragioneSociale === 'Rossi S.r.l.')
verifica('somma gli ordini', u.ordini === 4)
verifica('somma i pagamenti', u.pagamenti === 2)
verifica('ricorda tutte e tre le fonti', u.fonti.length === 3, u.fonti.join(', '))
// ⚠️ Il controllo che protegge l'unione: una fonte vuota non deve cancellare
// quello che un'altra sapeva già.
verifica('una fonte senza IBAN non cancella quello che c’era', u.iban !== '')

console.log('\n── L’ordine dei risultati ──')
const conIban = { ...vuoto, nome: 'A', iban: 'IT60X' }
const soloRegistro = { ...vuoto, nome: 'B', stato: 'Partner', ragioneSociale: 'B srl' }
verifica(
  'prima chi si può pagare subito',
  punteggio(conIban) > punteggio(soloRegistro),
  `${punteggio(conIban)} contro ${punteggio(soloRegistro)}`
)

console.log('\n── Sul vero: che cosa trova adesso ──')
const [pag, ord] = await Promise.all([
  db.richiestaPagamento.count(),
  db.ordine.count({ where: { fornitoreNome: { not: '' } } }),
])
console.log(`  ${pag} richieste di pagamento in archivio (di lì vengono gli IBAN)`)
console.log(`  ${ord} ordini con un fornitore registrato`)

const reg = await partnerAttivi({ q: 'a', perPagina: 5, stato: 'tutti' })
if (reg.stato === 'ok') {
  console.log(`  registro Anagrafiche: risponde, ${reg.totale} risultati cercando «a»`)
  for (const p of reg.partner.slice(0, 3)) {
    console.log(`     ${p.nome}${p.ragioneSociale ? ` (${p.ragioneSociale})` : ''} · ${p.citta}`)
  }
  verifica('il registro risponde e dà nomi', reg.partner.length > 0)
} else {
  console.log(`  registro Anagrafiche: ${reg.stato}`)
  verifica('il registro risponde', false, reg.stato)
}

if (pag === 0) {
  console.log(
    '\n  ⚠️ Nessuna richiesta di pagamento in archivio: oggi la ricerca può proporre\n' +
      '     nomi e recapiti, non IBAN. Gli IBAN si conoscono solo perché li abbiamo\n' +
      '     usati — si riempirà da sé dalla prima richiesta salvata.'
  )
}

console.log(falliti === 0 ? '\nTutto torna.' : `\n${falliti} CONTROLLI FALLITI.`)
await db.$disconnect()
process.exit(falliti === 0 ? 0 : 1)
