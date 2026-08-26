// Prova della guardia contro il DOPPIO PAGAMENTO di uno stesso ordine.
//
// ⚠️⚠️ Il caso: si preme «Paga fornitore» su un ordine che ha già una richiesta
// in piedi. Prima si apriva il modulo vuoto e nasceva una richiesta gemella —
// due righe per lo stesso ordine, due avvisi a chi paga, e nessuna delle due che
// dice che l'altra esiste. È il modo in cui si finisce per pagare due volte lo
// stesso fornitore, e non se ne accorge nessuno: ognuna delle due sembra giusta.
//
// ⚠️ La guardia sta in DUE posti e servono tutti e due: il bottone spento (la
// porta) e il controllo nella rotta (la serratura). Un link già aperto in
// un'altra scheda arriva alla rotta senza passare dal bottone.
//
// ⚠️ Scrive sul database vero e cancella SOLO le righe che ha creato lei.
import 'dotenv/config'
import { db } from '../src/lib/db'

let male = 0
function prova(nome: string, ok: boolean, extra = '') {
  if (!ok) male++
  console.log(`${ok ? 'ok  ' : 'NO  '} ${nome}${extra ? ' — ' + extra : ''}`)
}

/** La stessa domanda che si fa la rotta prima di creare. */
async function apertaSu(numero: string) {
  const senza = numero.replace(/^#+/, '')
  return db.richiestaPagamento.findFirst({
    where: { ordineNumero: { in: [senza, `#${senza}`] }, pagataIl: null },
    orderBy: { creatoIl: 'desc' },
  })
}

const miei: string[] = []
try {
  const NUMERO = '#0000-PROVA'

  prova('su un ordine senza richieste non c è niente di aperto', (await apertaSu(NUMERO)) === null)

  // ── Una richiesta NON pagata blocca ──
  const aperta = await db.richiestaPagamento.create({
    data: {
      ordineNumero: NUMERO,
      intestatario: 'PROVA fioraio',
      importo: 80,
      iban: '',
      metodo: 'altro',
      riferimentoPagamento: 'prova automatica',
    },
  })
  miei.push(aperta.id)
  prova('una richiesta non pagata risulta aperta', (await apertaSu(NUMERO))?.id === aperta.id)

  // ⚠️⚠️ E la si trova anche cercando il numero SENZA cancelletto: in tabella le
  // richieste vecchie stanno così, e cercandone una forma sola la guardia non
  // troverebbe niente — cioè non farebbe niente, in silenzio.
  prova('la si trova anche col numero senza cancelletto', (await apertaSu('0000-PROVA'))?.id === aperta.id)

  // ── Segnandola pagata, NON blocca più ──
  //
  // ⚠️ È voluto: su un ordine può esserci un secondo fornitore (i fiori e la
  // torta), e vietarlo sarebbe vietare un caso vero.
  await db.richiestaPagamento.update({
    where: { id: aperta.id },
    data: { pagataIl: new Date(), pagataDaNome: 'prova automatica' },
  })
  prova('una richiesta già PAGATA non blocca un secondo fornitore', (await apertaSu(NUMERO)) === null)

  // ── Due aperte: si nomina la più recente ──
  const vecchia = await db.richiestaPagamento.create({
    data: { ordineNumero: NUMERO, intestatario: 'PROVA uno', importo: 10, iban: '', metodo: 'altro' },
  })
  miei.push(vecchia.id)
  await new Promise((r) => setTimeout(r, 1100))
  const recente = await db.richiestaPagamento.create({
    data: { ordineNumero: NUMERO, intestatario: 'PROVA due', importo: 20, iban: '', metodo: 'altro' },
  })
  miei.push(recente.id)
  prova(
    'con due aperte si nomina la più recente',
    (await apertaSu(NUMERO))?.id === recente.id,
    'chi legge deve trovare quella che ha appena fatto, non una di tre settimane fa'
  )
} finally {
  for (const id of miei) await db.richiestaPagamento.delete({ where: { id } })
  console.log(`\nripulite ${miei.length} righe di prova`)
  console.log(
    'richieste di prova rimaste:',
    await db.richiestaPagamento.count({ where: { ordineNumero: { contains: 'PROVA' } } })
  )
}

console.log(male ? `\n${male} prove FALLITE` : '\nTutte passate')
await db.$disconnect()
process.exit(male ? 1 : 0)
