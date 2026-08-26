import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { soldiOrdineDaOrders } from '@/lib/orders'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// QUANTO VALEVA L'ORDINE DI QUESTO RECLAMO, E QUANTO CI ERA RIMASTO.
//
//   GET /api/reclami/<id>/soldi
//
// ⚠️⚠️ IL MARGINE SI LEGGE DA ORDERS E NON SI RIFÀ IN CASA. Lo Standard Deluxy
// §7.4 lo dice: il margine si calcola solo là, ed è al NETTO IVA. Rifarlo qui
// come «totale − costo» darebbe un numero più alto e altrettanto credibile, e
// nessuna delle due schermate darebbe errore: direbbero solo due cifre diverse
// sulla stessa cosa, e a fine mese non si saprebbe quale credere.
//
// ⚠️ `null` NON è zero. Se Orders non risponde, o di quell'ordine non conosce il
// costo del fornitore, si scrive «non calcolabile» — mai «0 €», che si legge
// come «non ci abbiamo guadagnato niente».
//
// A che serve su un reclamo: è la cifra che manca quando si decide un rimborso.
// Rimborsare 250 € su un ordine che ce ne ha lasciati 40 non è la stessa
// decisione che rimborsarli su uno che ne ha lasciati 120, e finora chi
// decideva quel numero non ce l'aveva davanti.

export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const reclamo = await db.reclamo.findUnique({
    where: { id },
    select: { ordineNumero: true, ordineId: true },
  })
  if (!reclamo) return NextResponse.json({ errore: 'Reclamo non trovato' }, { status: 404 })

  const numero = (reclamo.ordineNumero ?? '').trim()
  if (!numero) {
    return NextResponse.json({
      soldi: null,
      nota: 'Questo reclamo non è legato a un numero d’ordine.',
    })
  }

  // L'id Shopify serve a Orders per non confondere due ordini con lo stesso
  // numero su negozi diversi (#1733 esiste su Cake e su Deluxy).
  const nostro = reclamo.ordineId
    ? await db.ordine.findUnique({
        where: { id: reclamo.ordineId },
        select: { shopifyId: true, totale: true, valuta: true },
      })
    : null

  const soldi = await soldiOrdineDaOrders(numero, nostro?.shopifyId ?? '')
  if (!soldi) {
    return NextResponse.json({
      // ⚠️ Se Orders non risponde si dice, e si mostra almeno il valore che
      // conosciamo noi: metà risposta detta per metà è meglio di un trattino.
      soldi: nostro?.totale ? { totale: nostro.totale, costo: null, margine: null, fornitore: '', costoDa: '' } : null,
      nota: 'Deluxy Orders non ha risposto: il margine non si può leggere adesso.',
    })
  }
  return NextResponse.json({ soldi, nota: '' })
}
