import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { conversazioniDellOrdine } from '@/lib/messaggi-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// I messaggi che riguardano questo ordine, per la scheda laterale.
//
// Torna le conversazioni collegate (numero d'ordine, email o telefono del
// cliente) e, per ognuna, le ultime battute: chi guarda l'ordine deve poter
// leggere cosa si sono detti senza cambiare pagina — e rispondere da lì.
export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const ordine = await db.ordine.findUnique({
    where: { id },
    select: { numero: true, email: true, telefono: true },
  })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  const conversazioni = await conversazioniDellOrdine(ordine)
  // Le ultime battute di ognuna: poche, perché qui servono a capire di cosa si
  // parlava, non a rileggere tutto. Per il resto c'è l'Inbox.
  const conMessaggi = await Promise.all(
    conversazioni.map(async (c) => ({
      ...c,
      messaggi: await db.messaggio.findMany({
        where: { conversazioneId: c.id },
        orderBy: { creatoIl: 'desc' },
        take: 6,
        select: {
          id: true,
          direzione: true,
          testo: true,
          oggetto: true,
          creatoIl: true,
          utenteNome: true,
        },
      }),
    }))
  )

  return NextResponse.json({
    // I messaggi tornano dal più recente: si rigirano qui, così chi legge li
    // trova nell'ordine in cui sono stati detti.
    conversazioni: conMessaggi.map((c) => ({ ...c, messaggi: [...c.messaggi].reverse() })),
  })
}
