import { NextRequest, NextResponse } from 'next/server'
import { giroAiFuoriTurno, statoAiFuoriTurno } from '@/lib/ai-fuori-turno'
import { salvaImpostazione } from '@/lib/impostazioni'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// LA RISPOSTA AUTOMATICA, GOVERNATA DALL'INBOX.
//
//   GET   /api/ai-fuori-turno            → com'è messa: accesa?, chi è in turno,
//                                          l'ultimo giro, quante aspettano
//   POST  /api/ai-fuori-turno?prova=1    → fa il giro SENZA mandare niente
//   POST  /api/ai-fuori-turno            → fa il giro per davvero
//   PATCH /api/ai-fuori-turno            → accende o spegne
//
// ⚠️⚠️ La PROVA esiste perché questa è l'unica funzione che parla ai clienti da
// sola: prima di accenderla si guarda cosa farebbe, riga per riga, senza che
// nessuno riceva niente. E si riguarda ogni volta che si cambiano gli script.
//
// ⚠️⚠️ ACCENDERE E FAR PARTIRE UN GIRO VERO SONO DA AMMINISTRATORE. Sono i due
// gesti che fanno arrivare un messaggio a un cliente senza che una persona
// l'abbia letto: non è una preferenza di chi lavora, è una decisione di chi
// risponde di quello che l'azienda dice. La PROVA invece la può fare chiunque
// sia dentro — è il modo di capire cosa direbbe, e non manda niente.

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  return NextResponse.json(await statoAiFuoriTurno())
}

export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const prova = req.nextUrl.searchParams.get('prova') === '1'
  if (!prova && io.ruolo !== 'admin') {
    return NextResponse.json(
      {
        errore:
          'Far partire un giro vero manda messaggi ai clienti: serve un amministratore. Puoi però fare la prova, che non manda niente.',
      },
      { status: 403 }
    )
  }
  const esito = await giroAiFuoriTurno({ prova })
  return NextResponse.json({ ok: true, prova, ...esito })
}

export async function PATCH(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  if (io.ruolo !== 'admin') {
    return NextResponse.json(
      { errore: 'Accendere le risposte automatiche è da amministratore.' },
      { status: 403 }
    )
  }
  const { acceso } = (await req.json().catch(() => ({}))) as { acceso?: boolean }
  if (typeof acceso !== 'boolean') {
    return NextResponse.json({ errore: 'Manca «acceso».' }, { status: 400 })
  }
  // ⚠️ 'si' e non 'true': è la stessa parola che scrive la pagina Impostazioni,
  // e il motore confronta con quella. Due grafie per lo stesso interruttore
  // vorrebbero dire un interruttore che si accende da una parte e resta spento
  // dall'altra.
  await salvaImpostazione('aiFuoriTurnoAttivo', acceso ? 'si' : '')
  return NextResponse.json(await statoAiFuoriTurno())
}
