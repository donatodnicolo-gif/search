/**
 * LO SCONTO SEGUE LA COPERTURA (decisione utente, 01/09/2026)
 *
 * Fino a oggi `CategoryDiscount` diceva 30% su 106 province su 107: una regola
 * scritta ovunque non e' una regola, e' un default travestito. La regola vera e':
 *
 *   provincia DOVE ABBIAMO UN PARTNER  -> 30%
 *   provincia SCOPERTA                 -> 40%
 *
 * ⚠️ CHI CONTA COME COPERTURA. `PartnerProvince` dice che tutte e 107 le
 * province hanno partner, ma due partner le dichiarano TUTTE — «Artista Locale»
 * (che per definizione ritira nella citta' di consegna, quindi non e' un
 * presidio) e «ECI European Casting Industry». Contarli renderebbe la regola
 * vuota: coperto = c'e' almeno un partner OLTRE a quei due.
 *
 * ⚠️ LE ECCEZIONI RESTANO. Si riscrivono solo le righe che oggi valgono 30 o 40.
 * Milano e' al 20% per scelta: non e' un valore di serie e non si tocca. Qualsiasi
 * altra percentuale messa a mano sopravvive per lo stesso motivo.
 *
 * Simula e basta. Per scrivere davvero: --applica (fa prima un backup JSON).
 *
 *   DATABASE_URL="postgresql://…" node scripts/sconti-per-copertura.mjs
 *   DATABASE_URL="…" node scripts/sconti-per-copertura.mjs --applica
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync } from 'node:fs'

// Il segreto non si scrive su file (regola 3): con --env=<file> si legge da li'
// e resta solo in memoria.
// ⚠️ Si SOVRASCRIVE sempre: Prisma carica da solo `api/.env` (che punta a sqlite)
// prima che questo codice giri, quindi una guardia "se manca" non scatterebbe mai.
const env = process.argv.find((a) => a.startsWith('--env='))
if (env) {
  const riga = readFileSync(env.slice(6), 'utf8').split(String.fromCharCode(10)).find((r) => r.startsWith('DATABASE_URL='))
  if (riga) process.env.DATABASE_URL = riga.slice(13).trim().replace(/^"|"$/g, '').replace('schema=orders', 'schema=platform')
}

const APPLICA = process.argv.includes('--applica')
const NAZIONALI = ['Artista Locale', 'ECI European Casting Industry']
const COPERTA = 30
const SCOPERTA = 40
const DI_SERIE = [30, 40] // solo queste si riscrivono: il resto e' una scelta

const p = new PrismaClient()
const q = (s, ...v) => p.$queryRawUnsafe(s, ...v)

const coperte = new Set((await q(
  `SELECT DISTINCT pp."provinceId" AS id
     FROM "PartnerProvince" pp JOIN "Partner" pa ON pa.id = pp."partnerId"
    WHERE pa.active AND NOT pa.deleted
      AND COALESCE(pa."businessName",'') <> ALL($1::text[])`, NAZIONALI)).map(r => r.id))

const righe = await q(
  `SELECT d.id, d."discountPercent" AS pct, d."provinceId" AS "provinceId",
          pr.name AS provincia, pr.code AS sigla, c.name AS categoria
     FROM "CategoryDiscount" d
     JOIN "Province" pr ON pr.id = d."provinceId"
     JOIN "Category"  c ON c.id  = d."categoryId"`)

const cambi = [], intoccabili = [], gia = []
for (const r of righe) {
  const atteso = coperte.has(r.provinceId) ? COPERTA : SCOPERTA
  if (!DI_SERIE.includes(r.pct)) intoccabili.push(r)
  else if (r.pct === atteso) gia.push(r)
  else cambi.push({ ...r, da: r.pct, a: atteso })
}

const perProvincia = new Map()
for (const c of cambi) {
  const k = `${c.sigla || '--'} ${c.provincia}  ${c.da}% → ${c.a}%`
  perProvincia.set(k, (perProvincia.get(k) || 0) + 1)
}

console.log(`province coperte da partner veri: ${coperte.size} · righe di sconto: ${righe.length}`)
console.log(`  gia' giuste:      ${gia.length}`)
console.log(`  da cambiare:      ${cambi.length}`)
console.log(`  non di serie (non si toccano): ${intoccabili.length}` +
  (intoccabili.length ? ` → ${[...new Set(intoccabili.map(r => `${r.sigla} ${r.pct}%`))].join(', ')}` : ''))
console.log(`\nprovince toccate: ${perProvincia.size}`)
for (const [k, n] of [...perProvincia].sort()) console.log(`   ${k}  (${n} categorie)`)

if (!APPLICA) { console.log('\nSIMULAZIONE — niente scritto. Aggiungi --applica per eseguire.'); await p.$disconnect(); process.exit(0) }

const backup = `backup-sconti-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
writeFileSync(backup, JSON.stringify(righe, null, 1))
console.log(`\nbackup di TUTTE le ${righe.length} righe in ${backup}`)

let fatti = 0
for (const c of cambi) {
  await p.$executeRawUnsafe(`UPDATE "CategoryDiscount" SET "discountPercent" = $1 WHERE id = $2`, c.a, c.id)
  fatti++
}
console.log(`aggiornate ${fatti} righe.`)
await p.$disconnect()
