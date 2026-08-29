// Prova di «Hanno già preparato ordini per noi», sui dati veri.
//
// ⚠️⚠️ Nasce dalla segnalazione dell'utente sull'ordine #2798: «non vedo
// passiflora tra i fornitori». Passiflora quell'ordine l'aveva preparato, ma
// nel registro non ha né città né categoria, e l'elenco «fornitori in zona»
// filtra per provincia e per mestiere: per lui, non esiste. Questa prova
// pretende che nella lista dei NOSTRI ci sia.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { nostriFornitori, ordinaPerConsegna, perQuestaConsegna, quantoCentra } from '../src/lib/nostri-fornitori'
import { mestierePerFornitore } from '../src/lib/fornitori-zona'
import { riassuntoLavoro } from '../src/lib/cerca-fornitore'
import { siglaProvincia } from '../src/lib/province'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

const elenco = await nostriFornitori()
console.log(`fornitori che risultano dai nostri ordini: ${elenco.length}\n`)

prova('l elenco non è vuoto', elenco.length > 0)
// ⚠️ Il caso segnalato, per nome.
const passiflora = elenco.find((f) => f.nome.toLowerCase().includes('passiflora'))
prova('Passiflora c è', !!passiflora, passiflora ? riassuntoLavoro(passiflora.lavoro) : 'MANCA')
if (passiflora) {
  prova('e porta il suo lavoro', passiflora.lavoro.ordini > 0 && passiflora.lavoro.costo > 0, riassuntoLavoro(passiflora.lavoro))
  prova('e le città delle consegne', passiflora.citta.length > 0, passiflora.citta.join(', '))
}

// ⚠️⚠️ La prova che conta sull'ordine dell'elenco: chi ha già consegnato in
// QUELLA città sta in cima. È la decisione di chi lavora, non un dettaglio.
console.log('\n══ ORDINE PER LA CONSEGNA DI #2798 (Mijas) ══')
const ordine = await db.ordine.findFirst({ where: { numero: '#2798' }, select: { citta: true, fornitoreNome: true } })
console.log(`   consegna a: ${ordine?.citta ?? '(sconosciuta)'} · preparato da: ${ordine?.fornitoreNome ?? '-'}`)
if (ordine?.citta) {
  const messi = ordinaPerConsegna(elenco, ordine.citta, '')
  console.log(`   primo della lista: ${messi[0]?.nome}`)
  prova(
    'in cima c è chi ha già consegnato in quella città',
    messi[0]?.citta.some((c) => c.toLowerCase() === ordine.citta.toLowerCase()) ?? false,
    messi[0] ? messi[0].citta.join(', ') : ''
  )
  prova(
    'ed è proprio chi ha preparato quest ordine',
    messi[0]?.nome === ordine.fornitoreNome,
    `${messi[0]?.nome} contro ${ordine.fornitoreNome}`
  )
}

// ⚠️ «MA» di Málaga non è una provincia italiana: l'elenco per zona non può
// funzionare, e il messaggio a schermo deve dirlo invece di dire «non ne
// abbiamo». Qui si verifica il fatto da cui nasce quel messaggio.
console.log('\n══ LA PROVINCIA CHE NON È UNA PROVINCIA ══')
prova('«MA» non è una sigla italiana', siglaProvincia('MA') === '', `«${siglaProvincia('MA')}»`)
prova('«MS» (Massa-Carrara) invece sì', siglaProvincia('MS') === 'MS')
prova('e «Firenze» si riconosce dal nome', siglaProvincia('Firenze') === 'FI')

// ══════════════════════════════════════════════════════════════════════════
// LA SEGNALAZIONE DEL 29/08/2026 — un ordine di cioccolatini a ROMA
//
// A schermo comparivano sei righe: «Bliss Cake» (che consegna a Milano),
// quattro fiorai e un negozio di palloncini. L'utente: «qui devono apparire
// solo quelli collegati a quella provincia», «Bliss Cake è su Milano», «e poi
// due sono legati ai fiori».
// ══════════════════════════════════════════════════════════════════════════
console.log('\n══ IL MESTIERE, LETTO DAL NOME E DAI NEGOZI ══')
prova("«Bliss Cake» è una pasticceria", mestierePerFornitore('Bliss Cake', ['Cake']) === 'pasticceria')
prova("«SO'FLEUR» è un fioraio (parola francese)", mestierePerFornitore("SO'FLEUR", ['FLowers']) === 'fioraio')
prova('«Malus Flowers Crete» è un fioraio', mestierePerFornitore('Malus Flowers Crete', ['FLowers']) === 'fioraio')
prova('«Piacentini Cioccolato Gelati e Delizie» è una pasticceria', mestierePerFornitore('Piacentini Cioccolato Gelati e Delizie', ['Cake']) === 'pasticceria')
// ⚠️ Il NOME vince sul negozio: ha preparato un ordine del negozio Cake, ma
// fioraio lo è lui. Il negozio dice che ordine era, il nome che mestiere fa.
prova('«Bianchi Fiorista Como» è un fioraio anche se l ordine era del negozio Cake', mestierePerFornitore('Bianchi Fiorista Como', ['Cake']) === 'fioraio')
// ⚠️ Chi non si sa non si scarta.
prova('«Balloon Planet» lo decide il negozio', mestierePerFornitore('Balloon Planet', ['FLowers']) === 'fioraio')
prova('«Vecchio Maurizio» senza negozi non si sa', mestierePerFornitore('Vecchio Maurizio', []) === null)
prova('«ROSE CAKE DI ZORZ ALESSANDRO» non diventa fioraio per la parola «rose»', mestierePerFornitore('ROSE CAKE DI ZORZ ALESSANDRO', []) === 'pasticceria')

console.log('\n══ ALTROVE SI DICE SOLO QUANDO LO SI SA ══')
const milano = elenco.find((f) => f.nome.toLowerCase().includes('bliss cake'))
if (milano) {
  prova(
    'Bliss Cake, su un ordine a Roma, è ALTROVE per certo (consegna a Milano)',
    quantoCentra(milano, 'Roma', 'RM', 'IT').vicinanza === 1,
    milano.citta.join(', ')
  )
}
// ⚠️⚠️ La correzione che conta: Valmontone è in provincia di Roma, ma
// `siglaProvincia` risponde solo sui capoluoghi. Prima finiva «altrove» e con
// il filtro sarebbe SPARITO. Adesso è «non lo sappiamo», e resta a portata.
const valmontone = elenco.find((f) => f.citta.some((c) => c.toLowerCase() === 'valmontone'))
if (valmontone) {
  prova(
    'chi ha consegnato a Valmontone NON viene dichiarato altrove su un ordine a Roma',
    quantoCentra(valmontone, 'Roma', 'RM', 'IT').vicinanza === 0,
    `${valmontone.nome} · ${valmontone.citta.join(', ')}`
  )
}
// ⚠️⚠️ E il pezzo che lo fa RIENTRARE: i comuni della provincia li dice il
// registro Anagrafiche nella stessa richiesta. Se in provincia di RM il
// registro ha una pasticceria a Valmontone, allora Valmontone è in provincia di
// RM — letto, non indovinato — e chi ci ha consegnato torna «in zona».
if (valmontone) {
  prova(
    'e con i comuni del registro (Valmontone in RM) torna IN ZONA',
    quantoCentra(valmontone, 'Roma', 'RM', 'IT', ['Roma', 'Valmontone']).inZona === true
  )
  // ⚠️ Il segnale può solo aggiungere: un elenco di comuni che non lo contiene
  // NON deve farlo dichiarare «altrove».
  prova(
    'e un elenco di comuni che non lo contiene non lo dichiara altrove',
    quantoCentra(valmontone, 'Roma', 'RM', 'IT', ['Roma', 'Fiumicino']).vicinanza === 0
  )
}
// ⚠️ Il paese è il segnale che regge il filtro senza indovinare province.
const francia = elenco.find((f) => f.paesi.length > 0 && !f.paesi.includes('IT'))
if (francia) {
  prova(
    'chi ha consegnato solo all estero è altrove su un ordine italiano',
    quantoCentra(francia, 'Roma', 'RM', 'IT').vicinanza === 1,
    `${francia.nome} · ${francia.paesi.join(', ')}`
  )
}

console.log('\n══ L ELENCO COM È ADESSO, SU ROMA + PASTICCERIA ══')
const roma = perQuestaConsegna(elenco, { citta: 'Roma', provincia: 'RM', paese: 'IT', mestiere: 'pasticceria' })
console.log(`   in zona: ${roma.inZona.length} · non si sa dove: ${roma.senzaLuogo.length} · altrove: ${roma.altrove} · altro mestiere: ${roma.altroMestiere}`)
for (const f of [...roma.inZona, ...roma.senzaLuogo].slice(0, 8)) {
  console.log(`   · ${f.nome.slice(0, 42).padEnd(44)} vic=${f.vicinanza} ${f.citta.slice(0, 2).join(', ')}`)
}
const mostrati = [...roma.inZona, ...roma.senzaLuogo]
prova('nessun fioraio nell elenco di una pasticceria', mostrati.every((f) => f.mestiere !== 'fioraio'), mostrati.filter((f) => f.mestiere === 'fioraio').map((f) => f.nome).join(', ') || 'nessuno')
prova('Bliss Cake (Milano) non c è', !mostrati.some((f) => f.nome.toLowerCase().includes('bliss cake')))
prova('qualcuno è stato tolto perché fa l altro mestiere', roma.altroMestiere > 0, String(roma.altroMestiere))
prova('qualcuno è stato tolto perché consegna altrove', roma.altrove > 0, String(roma.altrove))
// ⚠️ Il filtro non deve svuotare la sezione: se non resta NIENTE da mostrare,
// la cosa utile («questi lavorano con noi») è sparita ed è un difetto.
prova('resta qualcuno da chiamare', mostrati.length > 0, `${mostrati.length} righe`)

console.log('\n══ I PRIMI CINQUE ══')
for (const f of elenco.slice(0, 5)) {
  console.log(`   ${f.nome.slice(0, 40).padEnd(42)} ${riassuntoLavoro(f.lavoro)} · ${f.citta.slice(0, 2).join(', ')}`)
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
