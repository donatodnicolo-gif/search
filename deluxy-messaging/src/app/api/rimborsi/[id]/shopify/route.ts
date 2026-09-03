import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { rimborsaSuShopify } from '@/lib/rimborso-shopify'

export const dynamic = 'force-dynamic'
// Due chiamate a Shopify (lettura dell'ordine e rimborso): i 10 secondi di suo
// sono stretti, e un timeout QUI vorrebbe dire non sapere se i soldi sono usciti.
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// Fa partire il rimborso VERO su Shopify, da una richiesta già approvata.
//
// ⚠️⚠️ È l'unica rotta di quest'app che fa uscire denaro. Le difese, in ordine:
//   1. utente vero (non solo cookie firmato) e ruolo `admin`;
//   2. la richiesta dev'essere in stato `approvato` — chi chiede e chi approva
//      restano due atti distinti;
//   3. la riga si PRENDE con una scrittura condizionata prima di chiamare
//      Shopify: due clic ravvicinati, o due schede aperte, non possono
//      rimborsare due volte;
//   4. l'importo lo ricontrolla Shopify su `netPayment` (vedi la libreria);
//   5. se qualcosa va storto la riga torna `approvato` con scritto il motivo —
//      non resta né a metà né "fatta" per finta.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  // ⚠️ Approvare è una cosa, far uscire i soldi un'altra: questa la può premere
  // solo un admin. Un operatore continua a chiedere e a segnare, come prima.
  if (io.ruolo !== 'admin') {
    return NextResponse.json(
      { errore: 'Solo un amministratore può far partire il rimborso su Shopify.' },
      { status: 403 }
    )
  }

  const { avvisaCliente } = (await req.json().catch(() => ({}))) as { avvisaCliente?: boolean }

  const richiesta = await db.rimborso.findUnique({ where: { id } })
  if (!richiesta) return NextResponse.json({ errore: 'Rimborso non trovato.' }, { status: 404 })
  if (richiesta.stato !== 'approvato') {
    return NextResponse.json(
      {
        errore:
          richiesta.stato === 'eseguito'
            ? 'Questa richiesta risulta già rimborsata.'
            : 'Il rimborso parte solo da una richiesta approvata.',
      },
      { status: 409 }
    )
  }

  const quando = new Date()
  // Quello che c era scritto non si butta: la nota di prima resta in coda.
  const prima = richiesta.esito.trim() ? ` · ${richiesta.esito.trim()}` : ''
  // ── La presa della riga ──
  // ⚠️⚠️ `updateMany` con lo stato nella WHERE: chi vince scrive, gli altri
  // contano zero e si fermano. Senza, due clic sullo stesso bottone partivano
  // tutti e due — e su Shopify sarebbero due rimborsi veri.
  const presa = await db.rimborso.updateMany({
    where: { id, stato: 'approvato' },
    data: {
      stato: 'eseguito',
      eseguitoIl: quando,
      esito: `Rimborso su Shopify in corso… (avviato da ${io.nome} il ${quando.toLocaleString('it-IT')})${prima}`,
    },
  })
  if (presa.count !== 1) {
    return NextResponse.json({ errore: 'Il rimborso è già stato preso in carico.' }, { status: 409 })
  }

  const esito = await rimborsaSuShopify({
    ordineId: richiesta.ordineId,
    importo: richiesta.importo,
    nota: richiesta.motivo || `Rimborso ordine ${richiesta.ordineNumero}`,
    avvisaCliente: Boolean(avvisaCliente),
  })

  if (esito.stato !== 'ok') {
    // Torna com'era, col motivo scritto: una richiesta che non è partita deve
    // restare approvata e riprovabile, non «eseguita» a vuoto.
    const rimborso = await db.rimborso.update({
      where: { id },
      data: {
        stato: 'approvato',
        eseguitoIl: null,
        esito: `Rimborso NON partito il ${quando.toLocaleString('it-IT')}: ${esito.messaggio}${prima}`,
      },
    })
    return NextResponse.json({ errore: esito.messaggio, rimborso }, { status: 502 })
  }

  const rimborso = await db.rimborso.update({
    where: { id },
    data: {
      esito: `Rimborsato su Shopify da ${io.nome} il ${quando.toLocaleString('it-IT')} · ${esito.refundId}${prima}`,
    },
  })
  return NextResponse.json({ rimborso, refundId: esito.refundId })
}
