// Prova della REGOLA con cui si sceglie l'IBAN da proporre nel modulo pagamenti.
//
// ⚠️⚠️ IL CASO VERO (09/09/2026, domanda dell'utente su «Petit Jardin -
// Fioreria»): il modulo diceva «l'IBAN va scritto a mano» anche per fornitori
// il cui IBAN sta nel registro Anagrafiche. Contati quel giorno: 80 IBAN
// distinti nel registro, 70 conosciuti dai nostri pagamenti, **24 solo nel
// registro** — fra cui Enrico Rizzi Milano, Il Fiore Di Fabula, FAG Torino
// Fiori. Il CS ce li scriveva e non li rileggeva mai.
//
// Adesso li rilegge, e questa prova tiene ferme le tre cose che NON devono
// cambiare aprendo quella porta:
//   1. un IBAN già usato per un bonifico batte sempre quello dell'anagrafica;
//   2. se dai pagamenti risultano IBAN DISCORDI non se ne propone nessuno, e
//      quello del registro non deve infilarsi lì a fare da arbitro;
//   3. la provenienza viaggia insieme all'IBAN — è quella che il modulo scrive
//      a schermo prima di far partire il bonifico.
import { unisci } from '../src/lib/cerca-fornitore'
import type { FornitoreTrovato } from '../src/lib/cerca-fornitore'

function pezzo(p: Partial<FornitoreTrovato>): FornitoreTrovato {
  return {
    idRegistro: '', nome: 'Fioreria Esempio', ragioneSociale: '', citta: '', telefono: '',
    email: '', iban: '', intestatarioConto: '', ibanDiversi: 0, ibanDa: '', ordini: 0,
    ultimoCosto: null, pagamenti: 0, fonti: [], stato: '', categoria: '', indirizzo: '',
    mapsId: '', voto: null, recensioni: 0, chiuso: false, corrispondenza: 0,
    ...p,
  } as FornitoreTrovato
}

const DA_PAGAMENTO = 'IT60X0542811101000000123456'
const DA_REGISTRO = 'IT56U0839710200000020121930'

let male = 0
function prova(
  nome: string,
  pezzi: FornitoreTrovato[],
  atteso: { iban: string; ibanDa: string }
) {
  const [f] = unisci(pezzi)
  const ok = f.iban === atteso.iban && f.ibanDa === atteso.ibanDa
  if (!ok) male++
  console.log(
    `${ok ? 'ok  ' : 'NO  '} ${nome}\n      atteso  iban=${atteso.iban || '(nessuno)'} da=${atteso.ibanDa || '(nessuna)'}` +
      `\n      avuto   iban=${f.iban || '(nessuno)'} da=${f.ibanDa || '(nessuna)'}`
  )
}

console.log('\n=== Quale IBAN propone il modulo pagamenti ===\n')

// 1. Solo il registro ce l'ha: è il caso dei 24, e prima non usciva niente.
prova(
  'solo il registro ha l’IBAN → si propone quello, dicendo che viene dal registro',
  [
    pezzo({ fonti: ['ordine'], ordini: 1 }),
    pezzo({ fonti: ['registro'], iban: DA_REGISTRO, ibanDa: 'registro', intestatarioConto: 'Fioreria Esempio' }),
  ],
  { iban: DA_REGISTRO, ibanDa: 'registro' }
)

// 2. Tutti e due: vince il provato, qualunque sia l'ordine di arrivo.
prova(
  'pagamento + registro → vince il PAGAMENTO (l’abbiamo già usato davvero)',
  [
    pezzo({ fonti: ['pagamento'], iban: DA_PAGAMENTO, ibanDa: 'pagamento', pagamenti: 3 }),
    pezzo({ fonti: ['registro'], iban: DA_REGISTRO, ibanDa: 'registro' }),
  ],
  { iban: DA_PAGAMENTO, ibanDa: 'pagamento' }
)
prova(
  'stesso caso ma il registro arriva PRIMA → vince lo stesso il pagamento',
  [
    pezzo({ fonti: ['registro'], iban: DA_REGISTRO, ibanDa: 'registro' }),
    pezzo({ fonti: ['pagamento'], iban: DA_PAGAMENTO, ibanDa: 'pagamento', pagamenti: 3 }),
  ],
  { iban: DA_PAGAMENTO, ibanDa: 'pagamento' }
)

// 3. Il rifiuto deliberato resta un rifiuto.
prova(
  'IBAN discordi nei pagamenti → NESSUNO, e il registro non fa da arbitro',
  [
    pezzo({ fonti: ['pagamento'], iban: '', ibanDiversi: 2, ibanDa: '', pagamenti: 2 }),
    pezzo({ fonti: ['registro'], iban: DA_REGISTRO, ibanDa: 'registro' }),
  ],
  { iban: '', ibanDa: '' }
)

// 4. Nessuno ce l'ha: si scrive a mano, come sempre.
prova(
  'nessuna fonte ha l’IBAN → si scrive a mano',
  [pezzo({ fonti: ['ordine'], ordini: 2 }), pezzo({ fonti: ['registro'] })],
  { iban: '', ibanDa: '' }
)

// 5. Il nome sul conto segue l'IBAN che ha vinto, non l'altro.
{
  const [f] = unisci([
    pezzo({ fonti: ['pagamento'], iban: DA_PAGAMENTO, ibanDa: 'pagamento', intestatarioConto: 'Mario Rossi' }),
    pezzo({ fonti: ['registro'], iban: DA_REGISTRO, ibanDa: 'registro', intestatarioConto: 'FIORERIA ESEMPIO SRL' }),
  ])
  const ok = f.intestatarioConto === 'Mario Rossi'
  if (!ok) male++
  console.log(
    `${ok ? 'ok  ' : 'NO  '} il nome sul conto segue l’IBAN che ha vinto\n      atteso  «Mario Rossi»\n      avuto   «${f.intestatarioConto}»`
  )
}

console.log(male ? `\n${male} PROVE FALLITE\n` : '\nTutte le prove passate.\n')
process.exit(male ? 1 : 0)
