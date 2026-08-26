// Prova delle regole di marchio col QUARTO negozio (business.deluxy.it).
//
// ⚠️⚠️ IL CASO VERO: finché i negozi erano tre, le regole scritte a mano —
// «se contiene deluxy allora è deluxy.it» — davano la risposta giusta per
// costruzione. «business.deluxy.it» contiene «deluxy»: senza toccare niente, il
// quarto negozio veniva siglato **DL** e cercato come **deluxy.it**, cioè
// scambiato per il negozio regali. Nessun errore a schermo: il marchio
// sbagliato, in silenzio.
//
// La prova tiene i due lati: il quarto va riconosciuto, e i primi tre non
// devono cambiare risposta.
import { brandRicercaDaNegozio, prefissoDaNegozio } from '../src/lib/negozi'
import { negozioDaTag } from '../src/lib/ordine-da-email'

let male = 0
function prova(nome: string, atteso: string, avuto: string) {
  const ok = atteso === avuto
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}  (atteso «${atteso}», avuto «${avuto}»)`)
}

console.log('══ BRAND PER LA RICERCA FORNITORI ══')
prova(
  'il quarto negozio non è deluxy.it',
  'business.deluxy.it',
  brandRicercaDaNegozio('business.deluxy.it', '90bfeb-f5.myshopify.com')
)
prova('regali', 'deluxy.it', brandRicercaDaNegozio('Deluxy', 'deluxygifts.myshopify.com'))
prova('fiori', 'deluxyflowers.com', brandRicercaDaNegozio('FLowers', 'fb72b1-2.myshopify.com'))
prova('torte', 'cakedesign.me', brandRicercaDaNegozio('Cake', 'cakedesign-5921.myshopify.com'))
prova(
  'il valore scritto a mano vince sempre sulla deduzione',
  'deluxy.it',
  brandRicercaDaNegozio('business.deluxy.it', '90bfeb-f5.myshopify.com', 'deluxy.it')
)

console.log('\n══ SIGLA IN RUBRICA ══')
prova('BS, non DL', 'BS', prefissoDaNegozio('business.deluxy.it', '90bfeb-f5.myshopify.com'))
prova('regali', 'DL', prefissoDaNegozio('Deluxy', 'deluxygifts.myshopify.com'))
prova('fiori', 'FL', prefissoDaNegozio('FLowers', 'fb72b1-2.myshopify.com'))
prova('torte', 'CK', prefissoDaNegozio('Cake', 'cakedesign-5921.myshopify.com'))

console.log('\n══ TAG IN TESTA ALL OGGETTO DELLA MAIL ══')
const negozi = [
  { id: 'gifts', nome: 'Deluxy', dominio: 'deluxygifts.myshopify.com', brandRicerca: 'deluxy.it' },
  { id: 'flowers', nome: 'FLowers', dominio: 'fb72b1-2.myshopify.com', brandRicerca: 'deluxyflowers.com' },
  { id: 'cake', nome: 'Cake', dominio: 'cakedesign-5921.myshopify.com', brandRicerca: 'cakedesign.me' },
  { id: 'business', nome: 'business.deluxy.it', dominio: '90bfeb-f5.myshopify.com', brandRicerca: 'business.deluxy.it' },
]
prova('[business]', 'business', String(negozioDaTag('business', negozi)))
prova('[cakedesign]', 'cake', String(negozioDaTag('cakedesign', negozi)))
// ⚠️⚠️ «deluxy» torna NULL, e non da oggi: combacia col dominio dei regali
// (deluxygifts) E col brand dei fiori (deluxyflowers.com). Due candidati =
// nessuna risposta, per scelta: un tag ambiguo non è un'informazione, e una
// mail nella colonna sbagliata è peggio di una mail senza colonna. La riga sta
// qui perché il quarto negozio NON deve peggiorare questo caso — e non lo fa:
// «business.deluxy.it» comincia per «business».
prova('[deluxy] resta ambiguo, come prima del quarto negozio', 'null', String(negozioDaTag('deluxy', negozi)))
prova('un tag che non è di nessuno', 'null', String(negozioDaTag('fiorista', negozi)))

console.log(male === 0 ? '\nTUTTO OK' : `\n${male} PROVE FALLITE`)
process.exit(male === 0 ? 0 : 1)
