// I 5 ordini allineati a mano il 26/08/2026 dicono anche a ORDERS che stanno in
// «attesa consegna».
//
// ⚠️ Perché serve: il codice nuovo comunica a Orders lo stato che cambia da solo,
// ma quei 5 erano già stati spostati sul database da
// `allinea-pagati-attesa-consegna.mjs`, che scrive solo qui. In Orders sarebbero
// rimasti allo stato vecchio finché qualcuno non li toccava a mano — e due app
// che dicono due cose diverse sono peggio di una che non sa.
//
// Si lancia una volta: `npx tsx scripts/allinea-orders-attesa-consegna.mts`
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { comunicaStatoAOrders } from '../src/lib/orders'

const NUMERI = ['#2778', '#2780', '#2783', '#2785', '#2799']
const db = new PrismaClient()

const ordini = await db.ordine.findMany({
  where: { numero: { in: NUMERI }, gestione: 'attesa_consegna' },
  select: { numero: true, shopifyId: true, gestioneDaNome: true, gestioneIl: true },
})
console.log(`da comunicare: ${ordini.length} su ${NUMERI.length}`)
for (const o of ordini) {
  const esito = await comunicaStatoAOrders(
    o.numero,
    o.shopifyId,
    'attesa_consegna',
    o.gestioneDaNome,
    o.gestioneIl
  )
  console.log(' ', o.numero, esito.ok ? 'OK' : `NO — ${esito.messaggio}`)
}
await db.$disconnect()
