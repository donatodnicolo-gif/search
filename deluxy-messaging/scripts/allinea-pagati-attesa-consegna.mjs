// Gli ordini GIÀ pagati che erano rimasti indietro.
//
// ⚠️ Il codice nuovo sposta l'ordine in «attesa consegna» quando si preme
// «Pagata» (26/08/2026). Ma correggere il codice non corregge quello che il
// codice sbagliato ha già scritto: gli ordini pagati PRIMA restano dov'erano, e
// nessuno li guarda più. Questo script li allinea una volta sola.
//
// ⚠️ Solo in AVANTI e solo dagli stati di STATI_DA_SPOSTARE_SE_PAGATO: `gestito`
// e `attesa_consegna` non si toccano, `in_app` nemmeno.
// ⚠️ Con `--scrivi` scrive. Senza, dice soltanto cosa farebbe.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const SPOSTA = ['da_gestire', 'ricerca_fornitore', 'in_pagamento', 'comunicazione']
const scrivi = process.argv.includes('--scrivi')
const db = new PrismaClient()

const pagate = await db.richiestaPagamento.findMany({
  where: { pagataIl: { not: null } },
  select: { ordineNumero: true, pagataIl: true, pagataDaNome: true },
  orderBy: { pagataIl: 'asc' },
})
const chiPaga = new Map()
for (const r of pagate) {
  if (!r.ordineNumero) continue
  chiPaga.set(r.ordineNumero.replace('#', ''), r)
}

const varianti = [...chiPaga.keys()].flatMap((n) => [n, `#${n}`])
const ordini = await db.ordine.findMany({
  where: { numero: { in: varianti }, gestione: { in: SPOSTA } },
  select: { id: true, numero: true, negozioNome: true, gestione: true, clienteNome: true },
})

console.log(`richieste pagate: ${pagate.length} · ordini rimasti indietro: ${ordini.length}`)
for (const o of ordini) {
  const r = chiPaga.get(o.numero.replace('#', ''))
  console.log(
    `  ${o.numero} (${o.negozioNome}, ${o.clienteNome}) : ${o.gestione} -> attesa_consegna` +
      ` · pagato il ${r?.pagataIl?.toLocaleDateString('it-IT')} da ${r?.pagataDaNome || '—'}`
  )
  if (!scrivi) continue
  await db.ordine.update({
    where: { id: o.id },
    data: {
      gestione: 'attesa_consegna',
      gestioneIl: new Date(),
      // ⚠️ Il nome di chi ha pagato, non il nostro: è quel gesto ad aver
      // spostato l'ordine, e attribuirlo a «script» renderebbe la riga
      // illeggibile fra sei mesi.
      gestioneDaNome: r?.pagataDaNome || '',
      gestioneDaId: '',
    },
  })
}
console.log(scrivi ? 'SCRITTO.' : 'PROVA — rilancia con --scrivi per applicare.')
await db.$disconnect()
