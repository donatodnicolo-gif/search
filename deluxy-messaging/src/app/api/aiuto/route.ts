import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le domande all'amministratore: si scrivono dal pannello laterale, si
// rispondono da lì, e restano scritte.
//
// ⚠️ Non c'è un ruolo per CHIEDERE: chiunque lavori può bloccarsi. C'è per
// RISPONDERE, e per vedere le domande degli altri: quelle sono di chi coordina.

type DomandaDto = {
  id: string
  testo: string
  pagina: string
  ordineNumero: string
  conversazioneId: string
  utenteNome: string
  mia: boolean
  stato: string
  risposta: string
  rispostaDaNome: string
  rispostaIl: string | null
  lettaIl: string | null
  creatoIl: string
}

async function elenco(ioId: string, amministratore: boolean) {
  // ⚠️ Un operatore vede **le sue**, un amministratore **tutte**: le domande
  // degli altri raccontano dove sono in difficoltà i colleghi, e non è
  // materiale da corridoio.
  const righe = await db.domandaAiuto.findMany({
    where: amministratore ? {} : { utenteId: ioId },
    orderBy: [{ stato: 'asc' }, { creatoIl: 'desc' }],
    take: 200,
  })
  const domande: DomandaDto[] = righe.map((d) => ({
    id: d.id,
    testo: d.testo,
    pagina: d.pagina,
    ordineNumero: d.ordineNumero,
    conversazioneId: d.conversazioneId,
    utenteNome: d.utenteNome,
    mia: d.utenteId === ioId,
    stato: d.stato,
    risposta: d.risposta,
    rispostaDaNome: d.rispostaDaNome,
    rispostaIl: d.rispostaIl?.toISOString() ?? null,
    lettaIl: d.lettaIl?.toISOString() ?? null,
    creatoIl: d.creatoIl.toISOString(),
  }))

  // I due numeri della linguetta, e sono due cose diverse:
  // · l'amministratore deve sapere quante domande **aspettano lui**;
  // · chi ha chiesto deve sapere che **gli hanno risposto** — anche se nel
  //   frattempo è andato su un'altra pagina, o quella risposta non la vede mai.
  const daRispondere = amministratore
    ? await db.domandaAiuto.count({ where: { stato: 'aperta' } })
    : 0
  const risposteDaLeggere = await db.domandaAiuto.count({
    where: { utenteId: ioId, stato: 'risposta', lettaIl: null },
  })
  return { domande, daRispondere, risposteDaLeggere, amministratore }
}

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  return NextResponse.json(await elenco(io.id, io.ruolo === 'admin'))
}

type Corpo = {
  azione?: 'chiedi' | 'rispondi' | 'letta'
  id?: string
  testo?: string
  pagina?: string
  ordineNumero?: string
  conversazioneId?: string
}

export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as Corpo
  const amministratore = io.ruolo === 'admin'

  // ── Rispondere ──
  if (c.azione === 'rispondi') {
    if (!amministratore) {
      return NextResponse.json({ errore: 'Rispondono gli amministratori.' }, { status: 403 })
    }
    const testo = (c.testo ?? '').trim()
    if (!c.id || !testo) {
      return NextResponse.json({ errore: 'Scrivi la risposta.' }, { status: 400 })
    }
    await db.domandaAiuto.updateMany({
      where: { id: c.id },
      data: {
        risposta: testo,
        stato: 'risposta',
        rispostaDaNome: io.nome,
        rispostaIl: new Date(),
        // ⚠️ Rispondere azzera «letta»: se l'amministratore corregge una
        // risposta già letta, chi aveva chiesto deve rivederla — altrimenti
        // resta con la versione vecchia e nessuno se ne accorge.
        lettaIl: null,
      },
    })
    return NextResponse.json(await elenco(io.id, amministratore))
  }

  // ── «L'ho letta» ──
  if (c.azione === 'letta') {
    if (!c.id) return NextResponse.json({ errore: 'Manca l’id.' }, { status: 400 })
    // Solo le proprie: segnare come letta la domanda di un collega toglierebbe
    // a lui il pallino senza che l'abbia vista.
    await db.domandaAiuto.updateMany({
      where: { id: c.id, utenteId: io.id },
      data: { lettaIl: new Date() },
    })
    return NextResponse.json(await elenco(io.id, amministratore))
  }

  // ── Chiedere ──
  const testo = (c.testo ?? '').trim()
  if (!testo) return NextResponse.json({ errore: 'Scrivi la domanda.' }, { status: 400 })

  await db.domandaAiuto.create({
    data: {
      testo,
      // ⚠️ Il contesto arriva dalla pagina e non da un campo da compilare: una
      // domanda su tre arriverebbe senza, e chi risponde dovrebbe rincorrere.
      pagina: (c.pagina ?? '').slice(0, 200),
      ordineNumero: (c.ordineNumero ?? '').trim().slice(0, 20),
      conversazioneId: (c.conversazioneId ?? '').trim().slice(0, 40),
      utenteId: io.id,
      utenteNome: io.nome,
    },
  })
  return NextResponse.json(await elenco(io.id, amministratore))
}
