// Segna «gestito» ogni ordine del Customer Service che ha GIA' una consegna
// caricata nella piattaforma consegne (27/08, chiesto dall'utente), con
// OPERATORE = chi ha creato la consegna. La logica: se qualcuno ha gia'
// caricato la consegna in piattaforma, quell'ordine e' stato lavorato — non
// deve restare «Da iniziare» nella lista del CS.
//
// Match per gid Shopify (cifre di `Ordine.shopifyId` ↔ cifre di
// `Delivery.realOrderNumber`), consegne vive (non annullate/invalidate).
// Lo stato si comunica anche a Orders (csGestione), con la chiave della
// piattaforma, per gli ordini che conoscono il loro `ordersId`.
//
// Prova a secco di default; --scrivi per applicare (backup su file).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'))
const SCRIVI = process.argv.includes('--scrivi')
const cifre = (v) => String(v ?? '').replace(/\D/g, '')

// Connessione DIRETTA (5432) del Customer Service, dalla sua .env.
const envCs = fs.readFileSync(path.join(RADICE, '.env'), 'utf8')
const rigaCs = envCs.split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL='))
const db = new PrismaClient({ datasources: { db: { url: rigaCs.slice('DIRECT_URL='.length).trim().replace(/^"|"$/g, '') } } })

// ── 1) Le consegne vive della piattaforma, col loro creatore ────────────────
// Stesso cluster, schema `platform`: query raw QUALIFICATA.
const consegne = await db.$queryRawUnsafe(`
  SELECT d."realOrderNumber" gid, d."createdAt" creata, d.code,
         u."firstName" nome, u."lastName" cognome
  FROM platform."Delivery" d
  LEFT JOIN platform."User" u ON u.id = d."createdByUserId"
  WHERE d."deletedAt" IS NULL
    AND d.status NOT IN ('cancelled', 'invalidated', 'not_accepted')
    AND d."realOrderNumber" IS NOT NULL
  ORDER BY d."createdAt" ASC`)
const perGid = new Map()
for (const c of consegne) {
  const k = cifre(c.gid)
  if (!k || perGid.has(k)) {
    // La prima consegna col creatore vince; se la prima non ce l'ha e una
    // successiva si', si completa il nome senza spostare la data.
    if (k && perGid.has(k)) {
      const v = perGid.get(k)
      if (!v.nome && (c.nome || c.cognome)) v.nome = `${c.nome ?? ''} ${c.cognome ?? ''}`.trim()
    }
    continue
  }
  perGid.set(k, {
    creata: c.creata,
    code: c.code,
    nome: `${c.nome ?? ''} ${c.cognome ?? ''}`.trim(),
  })
}
console.log(`Piattaforma: ${perGid.size} ordini con almeno una consegna viva.`)

// ── 2) Gli ordini del CS non ancora gestiti ─────────────────────────────────
const ordini = await db.ordine.findMany({
  where: { gestione: { not: 'gestito' } },
  select: { id: true, numero: true, shopifyId: true, ordersId: true, gestione: true },
})
const daSegnare = ordini
  .map((o) => ({ o, piatta: perGid.get(cifre(o.shopifyId)) }))
  .filter((x) => x.piatta)
console.log(`CS: ${ordini.length} ordini non gestiti · con consegna in piattaforma: ${daSegnare.length}`)
const perStato = {}
for (const x of daSegnare) perStato[x.o.gestione] = (perStato[x.o.gestione] ?? 0) + 1
console.log('  per stato attuale:', JSON.stringify(perStato))
for (const x of daSegnare.slice(0, 8)) {
  console.log(`   ${x.o.numero} → gestito da «${x.piatta.nome || 'Piattaforma consegne'}» (consegna #${x.piatta.code})`)
}

if (!SCRIVI) {
  console.log('\nPROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi.')
} else {
  const backup = daSegnare.map((x) => ({ id: x.o.id, numero: x.o.numero, era: x.o.gestione }))
  const file = path.join(RADICE, 'scripts', `backup-segna-gestiti-${new Date().toISOString().slice(0, 10)}.json`)
  fs.writeFileSync(file, JSON.stringify(backup, null, 1))
  console.log(`\nBackup (${backup.length}) in ${file}`)

  // La chiave verso Orders: quella della piattaforma (AppSetting), che gia' scrive.
  const imp = Object.fromEntries((await db.$queryRawUnsafe(
    `SELECT key, value FROM platform."AppSetting" WHERE key IN ('ordersUrl','ordersApiKey')`,
  )).map((r) => [r.key, r.value]))
  const urlOrders = String(imp.ordersUrl ?? '').replace(/\/+$/, '')

  let segnati = 0, versoOrders = 0, senzaOrdersId = 0
  for (const x of daSegnare) {
    const nome = x.piatta.nome || 'Piattaforma consegne'
    await db.ordine.update({
      where: { id: x.o.id },
      data: {
        gestione: 'gestito',
        gestioneIl: new Date(x.piatta.creata),
        gestioneDaId: '',
        gestioneDaNome: nome,
      },
    })
    segnati++
    if (x.o.ordersId) {
      const res = await fetch(`${urlOrders}/api/v1/ordini/${encodeURIComponent(x.o.ordersId)}`, {
        method: 'PATCH',
        headers: { 'x-api-key': imp.ordersApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csGestione: 'gestito',
          csGestioneDa: nome,
          csGestioneIl: new Date(x.piatta.creata).toISOString(),
        }),
      }).catch(() => null)
      if (res?.ok) versoOrders++
    } else senzaOrdersId++
    if (segnati % 100 === 0) process.stdout.write(`  ${segnati}/${daSegnare.length}…`)
  }
  console.log(`\nSegnati gestiti: ${segnati} · comunicati a Orders: ${versoOrders} · senza ordersId (solo qui): ${senzaOrdersId}`)
}
await db.$disconnect()
