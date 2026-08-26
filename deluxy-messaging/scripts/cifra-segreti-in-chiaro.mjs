// I segreti rimasti IN CHIARO nella tabella Impostazione.
//
// ⚠️ Il 27/08/2026 quattro chiavi sono entrate in `CHIAVI_CIFRATE`
// (`igAppSecret`, `shopifyClientSecret`, `googleMapsApiKey`, `piattaformaApiKey`)
// perché erano segreti a tutti gli effetti e stavano in chiaro in un Postgres
// condiviso con altre tredici app. Ma cambiare l'elenco non cifra quello che è
// già scritto: questo script lo fa, una volta sola.
//
// ⚠️ È IDEMPOTENTE: riconosce i valori già cifrati dalla loro forma e non li
// tocca. Rilanciarlo non fa danni.
// ⚠️ Con `--scrivi` scrive. Senza, dice soltanto cosa farebbe.
// ⚠️ Non stampa MAI un valore: solo la chiave, la lunghezza e lo stato.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

const DA_CIFRARE = [
  'metaAppSecret', 'waToken', 'fbPageToken', 'igToken', 'googleClientSecret',
  'googleRefreshToken', 'ordersApiKey', 'searchApiKey', 'emailPassword',
  'anthropicApiKey', 'openaiApiKey', 'partnerApiKey', 'anagraficheApiKey',
  'igAppSecret', 'shopifyClientSecret', 'googleMapsApiKey', 'piattaformaApiKey',
]

const sembraCifrato = (v) => {
  const p = v.split('.')
  return p.length === 3 && p[0].length === 16 && p[1].length === 24 && p.every((x) => /^[A-Za-z0-9+/=]+$/.test(x))
}

// Stessa funzione di src/lib/crypto.ts: AES-256-GCM con APP_SECRET.
function chiave() {
  const s = process.env.APP_SECRET
  if (!s) throw new Error('APP_SECRET non configurato: senza non si può cifrare niente.')
  return crypto.createHash('sha256').update(s).digest()
}
function cifra(testo) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chiave(), iv)
  const dati = Buffer.concat([c.update(testo, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), dati].map((b) => b.toString('base64')).join('.')
}
function decifra(v) {
  const [iv, tag, dati] = v.split('.')
  const d = crypto.createDecipheriv('aes-256-gcm', chiave(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dati, 'base64')), d.final()]).toString('utf8')
}

const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()
const righe = await db.impostazione.findMany({ where: { chiave: { in: DA_CIFRARE } } })
console.log(`chiavi che devono stare cifrate: ${DA_CIFRARE.length} · presenti in tabella: ${righe.length}\n`)

let daFare = 0
for (const r of righe) {
  const v = r.valore ?? ''
  if (!v) { console.log(`  ${r.chiave.padEnd(22)} vuota`); continue }
  if (sembraCifrato(v)) { console.log(`  ${r.chiave.padEnd(22)} già cifrata`); continue }
  daFare++
  console.log(`  ${r.chiave.padEnd(22)} IN CHIARO (${v.length} caratteri) → da cifrare`)
  if (!scrivi) continue
  const cifrato = cifra(v)
  // ⚠️ Si ricontrolla PRIMA di scrivere: cifrare male un segreto e sovrascrivere
  // l'originale vuol dire perderlo, e nessuno se ne accorge finché non serve.
  if (decifra(cifrato) !== v) throw new Error(`${r.chiave}: la cifratura non torna, non scrivo niente`)
  await db.impostazione.update({ where: { chiave: r.chiave }, data: { valore: cifrato } })
}
console.log(daFare === 0 ? '\nNiente da fare: sono già tutte cifrate.' : scrivi ? `\nSCRITTO: ${daFare} cifrate.` : `\nPROVA — rilancia con --scrivi per cifrare ${daFare} chiavi.`)
await db.$disconnect()
