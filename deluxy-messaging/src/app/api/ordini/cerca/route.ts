import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Un ordine dal suo NUMERO, per agganciarci un messaggio.
//
// Serve alla finestra «Nuovo messaggio»: si scrive 1742 e vengono fuori cliente,
// mail, marchio e data di consegna — così il messaggio parte già col
// destinatario giusto e resta legato all'ordine anche in Inbox.
//
// ⚠️ La copia locale degli ordini tiene ~60 giorni: di un ordine più vecchio si
// risponde «non trovato», che è vero. Meglio dirlo che far credere che il numero
// sia sbagliato.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const grezzo = (req.nextUrl.searchParams.get('numero') ?? '').trim()
  const cifre = grezzo.replace(/\D/g, '')
  if (!cifre) return NextResponse.json({ errore: 'Serve un numero d’ordine.' }, { status: 400 })

  // In tabella i numeri stanno con il cancelletto («#1742»): si cerca in
  // entrambe le forme, perché chi scrive a mano non mette il #.
  const ordine = await db.ordine.findFirst({
    where: { OR: [{ numero: `#${cifre}` }, { numero: cifre }] },
    select: {
      id: true,
      numero: true,
      clienteNome: true,
      email: true,
      telefono: true,
      negozioId: true,
      negozioNome: true,
      dataConsegna: true,
      fasciaConsegna: true,
      totale: true,
      valuta: true,
    },
  })
  if (!ordine) {
    return NextResponse.json(
      { errore: `Nessun ordine ${cifre} fra quelli che teniamo qui (ultimi 60 giorni).` },
      { status: 404 }
    )
  }
  return NextResponse.json({ ordine })
}
