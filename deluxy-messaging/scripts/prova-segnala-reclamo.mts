// LA SEGNALAZIONE AL DELIVERY, provata fin dove si può senza scrivere niente.
//
// ⚠️⚠️ Utente, 11/09/2026: «se all'ordine è associato una consegna su app
// delivery invia una segnalazione all'app delivery di vedere il reclamo».
// Questo script fa i due passi veri — trova la consegna col numero+marchio, poi
// bussa alla rotta delle segnalazioni — SENZA toccare i nostri reclami: non
// chiama `segnalaReclamoAllaPiattaforma` (che scriverebbe l'esito in banca), ma
// i due pezzi sotto. Se di là la rotta non c'è ancora, si vede qui.
//   npx tsx scripts/prova-segnala-reclamo.mts
import { db } from '../src/lib/db'
import { listaEscluse } from '../src/lib/dettaglio-ordine'
import { marchioDdt } from '../src/lib/manda-in-app'
import { consegnePerDdt, piattaformaCollegata, segnalaReclamoInPiattaforma } from '../src/lib/piattaforma'

console.log('piattaforma collegata:', await piattaformaCollegata())

const reclami = await db.reclamo.findMany({
  where: { ordineNumero: { not: '' } },
  orderBy: { creatoIl: 'desc' },
  take: 8,
  select: { id: true, ordineId: true, ordineNumero: true, negozioNome: true, casistica: true, segnalatoIl: true },
})
console.log(`\n── I ${reclami.length} reclami più recenti: hanno una consegna di là? ──`)

let conConsegna: { id: string; numero: string; deliveryId: string } | null = null
for (const r of reclami) {
  const o = r.ordineId
    ? await db.ordine.findUnique({ where: { id: r.ordineId }, select: { appConsegneEscluse: true, negozioNome: true } })
    : null
  const t = await consegnePerDdt(
    r.ordineNumero,
    marchioDdt(o?.negozioNome || r.negozioNome || ''),
    listaEscluse(o?.appConsegneEscluse)
  )
  const consegne = t.stato === 'ok' ? t.dati.consegne : []
  console.log(
    `  ${r.ordineNumero} (${r.negozioNome || '—'}) · ${t.stato}` +
      (consegne.length ? ` → consegna ${consegne[0].numero ?? consegne[0].id} [${consegne[0].stato}]` : ' → nessuna consegna') +
      (r.segnalatoIl ? ' · già segnalato' : '')
  )
  if (!conConsegna && consegne.length) {
    conConsegna = { id: r.id, numero: r.ordineNumero, deliveryId: consegne[0].id }
  }
}

console.log('\n── La rotta delle segnalazioni, di là ──')
if (!conConsegna) {
  console.log('  nessun reclamo recente ha una consegna: non si può provare l invio')
} else {
  // ⚠️ Se la rotta non esiste, la piattaforma risponde 404 e NON crea niente:
  // è la prova che si può fare senza sporcare la bacheca di nessuno.
  const r = await segnalaReclamoInPiattaforma({
    deliveryId: conConsegna.deliveryId,
    oggetto: `[PROVA] Reclamo sull ordine ${conConsegna.numero}`,
    testo: 'Prova tecnica del canale segnalazioni: se leggi questo, la rotta esiste e va ripulita.',
    riferimento: `prova:${conConsegna.id}`,
    apertaDaNome: 'prova tecnica',
  })
  console.log(`  esito: ${r.stato}${'messaggio' in r ? ' — ' + r.messaggio : ''}`)
  if (r.stato === 'non-trovato') {
    console.log('  → la piattaforma NON ha ancora POST /api/v1/app/segnalazioni: va aggiunta di là.')
  }
  if (r.stato === 'ok') {
    console.log('  → la rotta c è: cancella la segnalazione di prova dalla piattaforma.')
  }
}
await db.$disconnect()
