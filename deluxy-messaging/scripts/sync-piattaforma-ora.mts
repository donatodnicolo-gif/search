// Lancia a mano la sincronizzazione con la piattaforma consegne (la stessa del
// cron /api/cron/piattaforma), e stampa cosa ha fatto.
//
//   npx tsx --env-file=.env scripts/sync-piattaforma-ora.mts            → prova: non scrive
//   npx tsx --env-file=.env scripts/sync-piattaforma-ora.mts --applica  → scrive
//
// ⚠️ La sync legge solo le vendite AGGIORNATE dall'ultimo giro: una regola nuova
// (es. «consegnata di là = Gestito qui», 06/09/2026) non tocca da sola le righe
// già copiate in passato. Per quelle c'è `--recupera`: passa sugli ordini che
// hanno GIÀ in tabella la consegna «delivered» e non sono «Gestito», e applica
// la stessa chiusura (note, chiamate, Orders).
import { db } from '../src/lib/db'
import { sincronizzaConPiattaforma } from '../src/lib/sync-piattaforma'
import { CHIUSURA } from '../src/lib/gestione'
import { chiudiNoteDellOrdine } from '../src/lib/diario-chiusura'
import { chiudiChiamateDellOrdine } from '../src/lib/chiamate'
import { comunicaStatoAOrders } from '../src/lib/orders'

const applica = process.argv.includes('--applica')
const recupera = process.argv.includes('--recupera')

const e = await sincronizzaConPiattaforma({ prova: !applica })
console.log(applica ? 'SYNC APPLICATA' : 'SYNC IN PROVA (niente scritto)')
console.log({ lette: e.lette, passateInApp: e.passateInApp, tornateANoi: e.tornateANoi, gestite: e.gestite, aggiornate: e.aggiornate, saltate: e.saltate, errore: e.errore })
for (const r of e.righe) console.log(' ', r)

if (recupera) {
  const daChiudere = await db.ordine.findMany({
    where: { appConsegnaStato: 'delivered', NOT: { gestione: CHIUSURA } },
    select: { id: true, numero: true, shopifyId: true, gestione: true, appPartner: true },
  })
  console.log(`\nRECUPERO: ${daChiudere.length} ordini consegnati di là e non «Gestito» qui`)
  for (const o of daChiudere) {
    console.log(`  ${o.numero} (${o.gestione}, ${o.appPartner || 'partner ?'})`)
    if (!applica) continue
    const adesso = new Date()
    await db.ordine.update({
      where: { id: o.id },
      data: { gestione: CHIUSURA, gestioneIl: adesso, gestioneDaId: '', gestioneDaNome: 'Piattaforma consegne', appGestionePrima: '' },
    })
    const note = await chiudiNoteDellOrdine(o.numero, 'Piattaforma consegne')
    const chiamate = await chiudiChiamateDellOrdine(o.id, o.numero, 'Piattaforma consegne')
    const orders = await comunicaStatoAOrders(o.numero, o.shopifyId, CHIUSURA, 'Piattaforma consegne', adesso).catch(() => ({ ok: false as const, messaggio: 'eccezione' }))
    console.log(`    → Gestito · note chiuse ${note} · chiamate chiuse ${chiamate} · Orders ${orders.ok ? 'avvisato' : 'NON avvisato: ' + (orders as { messaggio?: string }).messaggio}`)
  }
  if (!applica && daChiudere.length) console.log('  (niente scritto: rilancia con --applica --recupera)')
}
await db.$disconnect()
