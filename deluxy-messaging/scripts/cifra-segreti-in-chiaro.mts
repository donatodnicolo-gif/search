// I segreti rimasti IN CHIARO nella tabella Impostazione.
//
// ⚠️ Il 27/08/2026 quattro chiavi sono entrate in `CHIAVI_CIFRATE`
// (`igAppSecret`, `shopifyClientSecret`, `googleMapsApiKey`, `piattaformaApiKey`)
// perché erano segreti a tutti gli effetti e stavano in chiaro in un Postgres
// condiviso con altre tredici app. Ma cambiare l'elenco non cifra quello che è
// già scritto: questo script lo fa, una volta sola.
//
// ⚠️⚠️ USA `cifra` E `decifra` DELL'APP, NON UNA LORO COPIA. La prima versione di
// questo script se le era riscritte, e aveva derivato la chiave con
// `sha256(APP_SECRET)` invece che con `scryptSync(APP_SECRET, 'deluxy-messaging',
// 32)`: il giro di controllo tornava — perché cifrava e decifrava con la STESSA
// chiave sbagliata — e i due segreti sono finiti nel database illeggibili
// dall'app. Recuperati, ma è il motivo per cui questo file adesso è un `.mts`:
// per poter importare le funzioni vere.
//
// ⚠️ È IDEMPOTENTE: riconosce i valori già cifrati e non li tocca.
// ⚠️ Con `--scrivi` scrive. Senza, dice soltanto cosa farebbe.
// ⚠️ Non stampa MAI un valore: solo la chiave, la lunghezza e lo stato.
//
//   npx tsx scripts/cifra-segreti-in-chiaro.mts [--scrivi]
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { cifra, decifra } from '../src/lib/crypto'

const DA_CIFRARE = [
  'metaAppSecret', 'waToken', 'fbPageToken', 'igToken', 'googleClientSecret',
  'googleRefreshToken', 'ordersApiKey', 'searchApiKey', 'emailPassword',
  'anthropicApiKey', 'openaiApiKey', 'partnerApiKey', 'anagraficheApiKey',
  'igAppSecret', 'shopifyClientSecret', 'googleMapsApiKey', 'piattaformaApiKey',
]

const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()
const righe = await db.impostazione.findMany({ where: { chiave: { in: DA_CIFRARE } } })
console.log(`chiavi che devono stare cifrate: ${DA_CIFRARE.length} · presenti in tabella: ${righe.length}\n`)

let daFare = 0
for (const r of righe) {
  const v = r.valore ?? ''
  if (!v) {
    console.log(`  ${r.chiave.padEnd(22)} vuota`)
    continue
  }
  // ⚠️ «È già cifrata» si decide PROVANDO A DECIFRARLA con la funzione vera, non
  // guardandone la forma: una forma giusta cifrata con la chiave sbagliata
  // sembrerebbe a posto e resterebbe illeggibile per sempre.
  try {
    decifra(v)
    console.log(`  ${r.chiave.padEnd(22)} già cifrata`)
    continue
  } catch {
    // in chiaro, oppure cifrata male: in tutti e due i casi si riscrive
  }
  daFare++
  console.log(`  ${r.chiave.padEnd(22)} da cifrare (${v.length} caratteri)`)
  if (!scrivi) continue
  const cifrato = cifra(v)
  // ⚠️ Si ricontrolla PRIMA di scrivere: cifrare male un segreto e sovrascrivere
  // l'originale vuol dire perderlo, e nessuno se ne accorge finché non serve.
  if (decifra(cifrato) !== v) throw new Error(`${r.chiave}: la cifratura non torna, non scrivo niente`)
  await db.impostazione.update({ where: { chiave: r.chiave }, data: { valore: cifrato } })
}
console.log(
  daFare === 0
    ? '\nNiente da fare: sono già tutte cifrate.'
    : scrivi
      ? `\nSCRITTO: ${daFare} cifrate.`
      : `\nPROVA — rilancia con --scrivi per cifrare ${daFare} chiavi.`
)
await db.$disconnect()
