// RECUPERO: i fornitori già pagati che non sono mai arrivati in Anagrafiche.
//
// ⚠️ Il gancio che manda il fornitore al registro è nato la sera del 24/08/2026:
// i pagamenti registrati prima non sono mai partiti. Contati il 25/08: **5 su
// 17** erano nel registro. Questo script ripassa le richieste già pagate e
// richiama la stessa funzione dell'app — non una sua copia, o si proverebbe
// qualcosa di diverso da quello che succede davvero premendo «Pagata».
//
// ⚠️⚠️ **Di default NON scrive**: stampa che cosa farebbe. Si scrive con
//     npx tsx scripts/recupera-fornitori-in-anagrafica.mts --scrivi
//
// ⚠️ Un fornitore che il registro non riconosce con certezza NON viene creato:
// la funzione torna «ambiguo» e la richiesta resta nella pagina Match del
// registro, dove la risolve una persona. È il comportamento voluto: un doppione
// costa più di un'attesa.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { segnalaFornitorePagatoAlRegistro } from '../src/lib/registro-fornitori'

const scrivi = process.argv.includes('--scrivi')

// ⚠️ Chi NON si tocca, e perché: si dice, invece di saltarlo in silenzio.
const DA_LASCIARE: Record<string, string> = {
  'Battistella fioreria srl':
    'in registro c\'è «Fioreria Battistella»: stesse parole in ordine diverso è una somiglianza, non un\'identità — la unisce una persona dalla pagina Match',
}

const richieste = await db.richiestaPagamento.findMany({
  where: { pagataIl: { not: null } },
  select: { id: true, intestatario: true, ordineNumero: true, pagataIl: true },
  orderBy: { pagataIl: 'asc' },
})

console.log(`${richieste.length} richieste pagate.${scrivi ? '' : '  (PROVA: non scrivo niente)'}\n`)
const conto: Record<string, number> = {}
for (const r of richieste) {
  const motivo = DA_LASCIARE[r.intestatario.trim()]
  if (motivo) {
    console.log(`lasciata     ${r.intestatario.padEnd(48)} ${motivo}`)
    conto.lasciata = (conto.lasciata ?? 0) + 1
    continue
  }
  if (!scrivi) {
    console.log(`da provare   ${r.intestatario.padEnd(48)} (ordine ${r.ordineNumero})`)
    conto.daProvare = (conto.daProvare ?? 0) + 1
    continue
  }
  const esito = await segnalaFornitorePagatoAlRegistro(r.id)
  console.log(`${esito.esito.padEnd(12)} ${r.intestatario.padEnd(48)} ${esito.messaggio}`)
  conto[esito.esito] = (conto[esito.esito] ?? 0) + 1
}
console.log('\n' + JSON.stringify(conto))
await db.$disconnect()
