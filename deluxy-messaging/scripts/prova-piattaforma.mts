// Prova del collegamento con la PIATTAFORMA CONSEGNE e dello stato «In App».
//
// ⚠️⚠️ Quello che questa prova può e non può fare, detto subito: senza la chiave
// app della piattaforma non si può leggere niente di là. Allora verifica quello
// che si può verificare davvero — che la rotta esista e chieda la chiave, che il
// vocabolario degli stati sia quello giusto, che il ponte fra le due app (l'id
// di Orders) sia scritto sui nostri ordini — e DICE quello che resta da provare
// il giorno che la chiave c'è.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { eInApp, nomeStatoVendita, STATI_IN_APP } from '../src/lib/piattaforma-stati'
import { piattaformaCollegata } from '../src/lib/piattaforma'
import { sincronizzaConPiattaforma } from '../src/lib/sync-piattaforma'
import { GESTIONI, gestioneValida } from '../src/lib/gestione'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

console.log('══ IL VOCABOLARIO DEGLI STATI ══')
// ⚠️ Sono gli stati della PIATTAFORMA, scritti come li scrive lei: se cambiassero
// di là, «In App» smetterebbe di accendersi e nessuno vedrebbe un errore.
prova('«proposta» è nelle sue mani', eInApp('proposta'))
prova('«accettata» pure', eInApp('accettata'))
prova('«da_gestire» NO: esiste di là ma non è stato proposto a nessuno', !eInApp('da_gestire'))
prova('«non_accettata» NO: torna a noi', !eInApp('non_accettata'))
prova('«annullata» NO: torna a noi', !eInApp('annullata'))
prova('gli stati che contano sono due', STATI_IN_APP.length === 2, STATI_IN_APP.join(', '))
prova('ogni stato ha un nome leggibile', nomeStatoVendita('proposta') === 'proposto a un partner')
prova('e uno sconosciuto non diventa vuoto', nomeStatoVendita('boh') === 'boh')

console.log('\n══ LO STATO «IN APP» NEL NOSTRO VOCABOLARIO ══')
prova('«in_app» è uno stato valido', gestioneValida('in_app'))
prova(
  'e si chiama «In App» a schermo',
  GESTIONI.find((g) => g.chiave === 'in_app')?.nome === 'In App'
)

console.log('\n══ IL PONTE FRA LE DUE APP ══')
// ⚠️⚠️ La piattaforma aggancia le vendite con `externalOrderId` = l'id
// dell'ordine in DELUXY ORDERS. Senza quell'id sui nostri ordini, nessuna
// vendita è agganciabile e la colonna «In App» resterebbe vuota per sempre —
// senza errori, che è il modo peggiore.
const totali = await db.ordine.count()
const conOrdersId = await db.ordine.count({ where: { NOT: { ordersId: '' } } })
console.log(`   ordini in casa: ${totali} · con l'id di Orders: ${conOrdersId}`)
if (conOrdersId === 0) {
  console.log('   ⚠️ nessuno ancora: lo riempie la sincronizzazione con Orders al prossimo giro')
} else {
  prova('il ponte è scritto su almeno un ordine', conOrdersId > 0)
}

console.log('\n══ LA PIATTAFORMA RISPONDE? ══')
const collegata = await piattaformaCollegata()
console.log(`   chiave configurata: ${collegata ? 'sì' : 'NO'}`)
// ⚠️ Questa parte si prova SEMPRE, chiave o no: dice se la rotta esiste davvero.
// 401 = c'è e vuole la chiave (che è quello che deve fare); 404 = non è
// deployata, e allora tutto il resto non serve a niente.
const base = 'https://deluxy-delivery.vercel.app'
try {
  const res = await fetch(`${base}/api/v1/app/vendite?source=deluxy-orders`, {
    signal: AbortSignal.timeout(15000),
  })
  prova('la rotta delle vendite esiste e chiede la chiave', res.status === 401, `${res.status}`)
  const finta = await fetch(`${base}/api/v1/app/inventata`, { signal: AbortSignal.timeout(15000) })
  prova('e una rotta inventata risponde 404 (quindi il 401 vuol dire qualcosa)', finta.status === 404, `${finta.status}`)
} catch (e) {
  console.log(`   la piattaforma non ha risposto: ${e instanceof Error ? e.message : 'errore'}`)
  male++
}

console.log('\n══ IL GIRO, COM È MESSO ADESSO ══')
const esito = await sincronizzaConPiattaforma({ prova: true })
console.log(`   ${esito.errore || `lette ${esito.lette} · in app ${esito.passateInApp} · tornate ${esito.tornateANoi}`}`)
if (!collegata) {
  prova(
    'senza chiave lo dice, invece di fallire in silenzio',
    esito.errore.includes('non collegata'),
    esito.errore
  )
  console.log('\n   🔴 DA PROVARE QUANDO CI SARÀ LA CHIAVE:')
  console.log('      1. `node api/scripts/crea-chiave-app.mjs` nella piattaforma (sola lettura)')
  console.log('      2. incollarla in Impostazioni → Piattaforma consegne')
  console.log('      3. rilanciare questa prova: deve leggere le vendite e dire quante')
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
