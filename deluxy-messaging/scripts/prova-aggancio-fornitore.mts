// Prova del controllo sull'«agganciata» del registro anagrafiche.
//
// ⚠️⚠️ IL CASO VERO, letto nel registro delle modifiche di Anagrafiche il
// 25/08/2026: pagando «Paradis des fleurs» il match ha risposto «agganciata» su
// «Contatti senza azienda (HubSpot)» — un contenitore con 288 contatti — e il
// Customer Service gli ha scritto sopra «fornitore abituale». Il fornitore vero
// è rimasto fuori dall'anagrafica.
//
// La prova tiene i due lati insieme: quello che DEVE passare (il match esiste
// per quello) e quello che NON deve.
import { agganciaAffidabile } from '../src/lib/aggancio-fornitore'

let male = 0
function prova(nome: string, atteso: boolean, nostro: string, registro: string) {
  const avuto = agganciaAffidabile(nostro, registro)
  const ok = avuto === atteso
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}  («${nostro}» ~ «${registro}» → ${avuto})`)
}

console.log('══ NON DEVE AGGANCIARE ══')
prova('il caso vero: il contenitore HubSpot', false, 'Paradis des fleurs', 'Contatti senza azienda (HubSpot)')
prova('due fiorai diversi che condividono una parola', false, "SO'FLEUR", 'Les fleurs de May')
prova('stesse parole in ordine diverso: decide una persona', false, 'Battistella fioreria srl', 'Fioreria Battistella')
prova('un nome generico di una parola non identifica', false, 'Fiori', 'Fiori di Mimma')
prova('il registro senza nome', false, 'Paradis des fleurs', '')
prova('noi senza nome', false, '', 'Paradis des fleurs')
prova('due parole corte non bastano', false, 'A B', 'A B Fiori di Rossi')

console.log('\n══ DEVE AGGANCIARE — è il caso per cui il match esiste ══')
prova('stesso nome', true, 'Passiflora flower market', 'Passiflora flower market')
prova('il registro ha anche la città', true, 'Ketty Flowers', 'Ketty Flowers · PORTO CERVO')
prova('il nostro nome ha dentro l insegna del registro', true, 'S.A.S. ELENA FLEURS 46 RUE ARSON 06300 NICE', 'Elena Fleurs')
prova('l intestatario dentro l insegna', true, 'RIGUTTO ELENA', 'Il Giardino Di Rigutto Elena')
prova('accenti e maiuscole non contano', true, 'Goshà flowers', 'GOSHA FLOWERS')
prova('punteggiatura diversa', true, 'Sa Commercial Garden Group srls', 'S.A. COMMERCIAL GARDEN GROUP S.R.L.S.')

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
process.exit(male ? 1 : 0)
