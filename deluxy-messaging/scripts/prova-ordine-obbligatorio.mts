// Prova della regola: un pagamento che PARLA di un ordine deve avere quell
// ordine collegato.
//
// ⚠️⚠️ Il caso vero da cui nasce, visto su una riga di produzione: causale
// «Ordine #2791» e ordineNumero VUOTO. Chi l aveva scritta era convinta di aver
// collegato l ordine — il numero era li, davanti — ma scrivere un numero in un
// campo di testo non collega niente: niente valore, niente margine, e l ordine
// che non sa chi lo prepara.
//
// ⚠️ E la regola non e «serve sempre un ordine»: e «se ne parli, collegalo».
// Un canone, un rimborso spese, un acconto generico restano liberi.
import { cosaManca, ordineNominatoNellaCausale } from '../src/lib/metodo-pagamento'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}
const base = { metodo: 'iban', iban: 'IT60X0542811101000000123456', riferimento: '', intestatario: 'Fioreria X' }

console.log('══ SI BLOCCA ══')
{
  const m = cosaManca({ ...base, causale: 'Ordine #2791', ordineNumero: '' })
  prova('causale «Ordine #2791» senza ordine collegato', m.includes('#2791'), m.slice(0, 78))
}
prova('anche scritto senza cancelletto', !!cosaManca({ ...base, causale: 'ordine 2791', ordineNumero: '' }))
prova('anche solo il numero', !!cosaManca({ ...base, causale: '2791', ordineNumero: '' }))
prova('anche dentro una frase', !!cosaManca({ ...base, causale: 'saldo per ordine 12786 di agosto', ordineNumero: '' }))

console.log('\n══ NON SI BLOCCA ══')
prova('con l ordine collegato passa', !cosaManca({ ...base, causale: 'Ordine #2791', ordineNumero: '#2791' }))
// ⚠️ Un pagamento che con gli ordini non c entra deve restare libero, o la
// regola diventa «non si puo pagare niente che non sia un ordine».
prova('un canone senza numeri passa', !cosaManca({ ...base, causale: 'Canone mensile agosto', ordineNumero: '' }))
prova('un rimborso spese passa', !cosaManca({ ...base, causale: 'Rimborso spese trasferta', ordineNumero: '' }))
// ⚠️ Meno di tre cifre non e un ordine: un «x2» o un «12» bloccherebbero
// salvataggi legittimi.
prova('«acconto 50%» non e un ordine', !cosaManca({ ...base, causale: 'Acconto 50%', ordineNumero: '' }), 'due cifre')
prova('«bouquet x2» non e un ordine', !cosaManca({ ...base, causale: 'bouquet x2', ordineNumero: '' }))
prova('causale vuota passa', !cosaManca({ ...base, causale: '', ordineNumero: '' }))

console.log('\n══ LE ALTRE REGOLE REGGONO ANCORA ══')
prova('senza intestatario si blocca prima', cosaManca({ ...base, intestatario: '', causale: 'Ordine #1' }).includes('chi va pagato'))
prova('senza IBAN si blocca', cosaManca({ ...base, iban: '', causale: '', ordineNumero: '' }).includes('IBAN'))

console.log('\n══ IL RICONOSCITORE ══')
prova('«Ordine #2791» → #2791', ordineNominatoNellaCausale('Ordine #2791') === '#2791')
prova('«ordine 12786» → #12786', ordineNominatoNellaCausale('ordine 12786') === '#12786')
prova('«Acconto 50%» → niente', ordineNominatoNellaCausale('Acconto 50%') === '')
prova('vuota → niente', ordineNominatoNellaCausale('') === '')


// ══════════════════════════════════════════════════════════════════════════
// IL FORNITORE VA SCELTO, NON SCRITTO
//
// ⚠️⚠️ Segnalato guardando la schermata vera: nel campo c'era scritto «p». Un
// campo obbligatorio si soddisfa con una lettera, e da li in poi tutto
// funziona — la richiesta si salva, il fornitore «p» finisce sull ordine, e il
// bonifico parte verso un nome che non e un nome.
// ══════════════════════════════════════════════════════════════════════════
console.log('\n══ SCELTO O SCRITTO ══')
{
  const scritto = cosaManca({ ...base, causale: '', ordineNumero: '', intestatario: 'p', intestatarioScelto: '' })
  prova('«p» scritto a mano si blocca', scritto.includes('scritto a mano'), scritto.slice(0, 70))
  // ⚠️ Non si vietano i nomi corti: e una regola sull ASPETTO, e ci sono
  // insegne di due lettere. Il punto e da dove viene il nome.
  prova('  ma «p» SCELTO passa', !cosaManca({ ...base, causale: '', ordineNumero: '', intestatario: 'p', intestatarioScelto: 'p' }))
}
prova('un nome scelto dalla ricerca passa',
  !cosaManca({ ...base, causale: '', ordineNumero: '', intestatario: 'Fioreria X', intestatarioScelto: 'Fioreria X' }))
prova('un nome lungo ma scritto a mano si blocca',
  !!cosaManca({ ...base, causale: '', ordineNumero: '', intestatario: 'Pasticceria Rossi Snc', intestatarioScelto: '' }))
// ⚠️ Dove il campo non c e proprio (la rotta, che non puo sapere da dove viene
// il nome) la regola NON si applica: e un controllo della schermata.
prova('senza il campo, la regola non si applica',
  !cosaManca({ ...base, causale: '', ordineNumero: '', intestatario: 'Chiunque' }))
prova('e senza nome vince il messaggio di prima',
  cosaManca({ ...base, intestatario: '', intestatarioScelto: '' }).includes('chi va pagato'))

console.log(male === 0 ? '\nTutto a posto.' : `\n${male} SBAGLIATI.`)
process.exit(male === 0 ? 0 : 1)
