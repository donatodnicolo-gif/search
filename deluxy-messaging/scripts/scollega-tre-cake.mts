// Scollega i tre ordini CAKE che la regola «consegne da pagamenti» aveva
// agganciato il 06/09/2026 a consegne FLOWERS con lo stesso numero DDT
// (#1762→#44961, #1832→#47351, #1800→#46016). Fa quello che fa la «×» sulla
// scheda: toglie l'aggancio e mette l'id fra le escluse. Non tocca la piattaforma.
//
//   npx tsx scripts/scollega-tre-cake.mts
import { db } from '../src/lib/db'

for (const numero of ['#1762', '#1832', '#1800']) {
  const o = await db.ordine.findFirst({
    where: { numero, negozioNome: { contains: 'Cake', mode: 'insensitive' } },
    select: { id: true, numero: true, appConsegnaId: true, appConsegnaNumero: true, appConsegneEscluse: true },
  })
  if (!o || !o.appConsegnaId) {
    console.log(numero, 'niente da fare', o ? `(già scollegata; escluse: ${o.appConsegneEscluse || '—'})` : '(non trovato)')
    continue
  }
  const escluse = new Set((o.appConsegneEscluse ?? '').split(/\s+/).filter(Boolean))
  escluse.add(o.appConsegnaId)
  await db.ordine.update({
    where: { id: o.id },
    data: {
      appConsegneEscluse: [...escluse].join('\n'),
      appConsegnaId: '',
      appConsegnaNumero: '',
      appConsegnaStato: '',
      appConsegnaData: null,
      appConsegnaFascia: '',
    },
  })
  console.log(`${o.numero}: scollegata #${o.appConsegnaNumero} (${o.appConsegnaId})`)
}
await db.$disconnect()
