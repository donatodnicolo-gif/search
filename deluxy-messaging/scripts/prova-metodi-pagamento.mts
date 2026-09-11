// Prova i METODI DI PAGAMENTO senza creare nessun ordine: controlla che le
// specifiche impostate producano davvero il comportamento che promettono.
//
// ⚠️ Non chiama `creaOrdine`: quella fa nascere un ordine vero su Shopify. Qui
// si controllano le tre cose da cui dipende tutto il resto — la validazione,
// la rilettura dal database (mai dal browser) e i termini di pagamento che il
// negozio ha davvero, che sono ciò che impedisce a un ordine di nascere pagato.
//
//   npx tsx scripts/prova-metodi-pagamento.mts
import { db } from '../src/lib/db'
import { metodiDisponibili, metodoPerOrdine } from '../src/lib/metodi-pagamento'
import { descriviMetodo, validaMetodo } from '../src/lib/metodi-regole'
import { graphqlNegozio, negozioConToken } from '../src/lib/shopify-negozio'

let ok = 0
let ko = 0
function prova(nome: string, condizione: boolean, dettaglio = '') {
  if (condizione) {
    ok++
    console.log(`  ok   ${nome}`)
  } else {
    ko++
    console.log(`  KO   ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`)
  }
}

console.log('\n1. LE SPECIFICHE IMPOSTATE')
const tutti = await metodiDisponibili()
for (const m of tutti) {
  console.log(`  · ${m.nome} → ${descriviMetodo(m)}${m.attributo ? ` [attributo ${m.attributo}]` : ''}`)
}
prova('almeno un metodo impostato', tutti.length > 0, 'la terza scelta non comparirebbe nel modulo')
// ⚠️ Il contrassegno deve portare l'attributo giusto: è quello che in
// piattaforma fa nascere la «Vendita con Pagamento alla Consegna». Sbagliarlo
// non dà errore da nessuna parte — il valet semplicemente non sa che deve
// tornare con dei soldi.
const contrassegni = tutti.filter((m) => m.comeNasce === 'da-incassare' && m.quandoDovuto === 'consegna')
prova(
  'i metodi alla consegna portano Pagamento_Alla_Consegna',
  contrassegni.length > 0 && contrassegni.every((m) => m.attributo === 'Pagamento_Alla_Consegna'),
  contrassegni.map((m) => `${m.nome}=${m.attributo || '—'}`).join(', ')
)

console.log('\n2. LA VALIDAZIONE (le stesse frasi a schermo e sul server)')
prova('il nome vuoto si rifiuta', validaMetodo({ nome: '  ' }).ok === false)
prova(
  'un attributo con spazi si rifiuta',
  validaMetodo({ nome: 'X', attributo: 'Paga alla consegna' }).ok === false
)
prova('un attributo normale passa', validaMetodo({ nome: 'X', attributo: 'Pagamento_Alla_Consegna' }).ok === true)
// ⚠️ La regola che conta: un ordine già pagato non ha niente da incassare, e
// una riga che dice a chi consegna di tornare coi soldi sarebbe un'istruzione
// sbagliata su un ordine vero.
prova(
  'pagato + nota per chi consegna si rifiuta',
  validaMetodo({ nome: 'X', comeNasce: 'pagato', notaConsegna: 'DA INCASSARE' }).ok === false
)
prova(
  'un valore inventato per comeNasce diventa «da incassare»',
  (validaMetodo({ nome: 'X', comeNasce: 'gratis' }) as { ok: true; dati: { comeNasce: string } }).dati
    .comeNasce === 'da-incassare'
)

console.log('\n3. LA RILETTURA DAL DATABASE')
const primo = tutti[0]
if (primo) {
  const riletto = await metodoPerOrdine(primo.id)
  prova('un metodo acceso si rilegge', riletto?.id === primo.id)
}
prova('un id inventato non torna niente', (await metodoPerOrdine('cmq-non-esiste')) === null)
prova('un id vuoto non torna niente', (await metodoPerOrdine('')) === null)
// ⚠️ Uno SPENTO non si serve più: se qualcuno teneva il modulo aperto da
// stamattina, l'ordine non deve nascere con una regola ritirata.
const spento = await db.metodoPagamento.findFirst({ where: { attivo: false }, select: { id: true, nome: true } })
if (spento) {
  prova(`uno spento non si serve (${spento.nome})`, (await metodoPerOrdine(spento.id)) === null)
} else {
  console.log('  –    nessun metodo spento da provare (va bene: non ne hai)')
}

console.log('\n4. I TERMINI DI PAGAMENTO, NEGOZIO PER NEGOZIO')
// ⚠️⚠️ Sono LORO a far nascere l'ordine da incassare: senza, `draftOrderComplete`
// lo fa nascere PAGATO. Un negozio che non li ha deve fermare la creazione, non
// dichiarare incassati dei soldi che nessuno ha preso.
const negozi = await db.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true } })
for (const n of negozi) {
  const accesso = await negozioConToken(n.id)
  if (!accesso) {
    console.log(`  –    ${n.nome}: niente token, saltato`)
    continue
  }
  const r = await graphqlNegozio<{
    data?: { paymentTermsTemplates?: { id: string; paymentTermsType?: string }[] }
  }>(accesso.negozio, accesso.token, `{ paymentTermsTemplates { id paymentTermsType } }`).catch(
    () => ({}) as never
  )
  const tipi = (r.data?.paymentTermsTemplates ?? []).map((x) => x.paymentTermsType)
  prova(
    `${n.nome}: ha i termini «alla consegna» o «alla ricezione»`,
    tipi.includes('FULFILLMENT') || tipi.includes('RECEIPT'),
    tipi.join(', ') || 'nessun modello'
  )
}

console.log(`\n${ok} ok, ${ko} ko`)
await db.$disconnect()
process.exit(ko ? 1 : 0)
