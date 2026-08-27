import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// IL FILO DI DOMANDE E RISPOSTE DI UN RECLAMO.
//
//   GET  /api/reclami/<id>/messaggi
//   POST /api/reclami/<id>/messaggi   { testo, domanda?, rispostaA? }
//
// ⚠️⚠️ Perché serve: un reclamo non si risolve con «descrizione» + «esito». In
// mezzo c'è una conversazione — «il valet dice che ha citofonato, il cliente
// dice di no», «chiedo al fioraio se ha la prova di consegna», «risposto: ce
// l'ha». Finora stava nelle chat fra colleghi: chi riapriva il reclamo tre
// giorni dopo ricominciava da capo, e chi decideva un rimborso lo decideva
// senza sapere che cosa era già stato chiesto.

export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const messaggi = await db.messaggioReclamo.findMany({
    where: { reclamoId: id },
    orderBy: { creatoIl: 'asc' },
  })
  // ⚠️ Le domande ancora senza risposta si contano QUI e non a schermo: è il
  // numero che dice se questo reclamo aspetta qualcuno, e serve uguale alla
  // scheda e (domani) all'elenco. Contarlo in due posti vuol dire vederlo
  // divergere.
  const risposte = new Set(messaggi.map((m) => m.rispostaA).filter(Boolean))
  const senzaRisposta = messaggi.filter((m) => m.domanda && !risposte.has(m.id)).length
  return NextResponse.json({ messaggi, senzaRisposta })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  // ⚠️ Il cookie è `userId.HMAC(userId)` e vive trenta giorni: il middleware
  // ne verifica solo la FIRMA, e cancellare un utente non lo invalida. Senza
  // questa riga l'azione partiva lo stesso, con autore vuoto in archivio.
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    testo?: string
    domanda?: boolean
    rispostaA?: string
  }
  const testo = (c.testo ?? '').trim()
  if (!testo) return NextResponse.json({ errore: 'Scrivi qualcosa prima di mandare.' }, { status: 400 })

  const reclamo = await db.reclamo.findUnique({ where: { id }, select: { id: true } })
  if (!reclamo) return NextResponse.json({ errore: 'Reclamo non trovato' }, { status: 404 })

  // ⚠️ La domanda a cui si risponde dev'essere DI QUESTO reclamo: un id
  // arrivato dal browser non è una prova, e una risposta agganciata al filo
  // sbagliato sparirebbe dalla vista di tutti e due.
  let rispostaA = (c.rispostaA ?? '').trim()
  if (rispostaA) {
    const madre = await db.messaggioReclamo.findUnique({
      where: { id: rispostaA },
      select: { reclamoId: true },
    })
    if (!madre || madre.reclamoId !== id) rispostaA = ''
  }

  const messaggio = await db.messaggioReclamo.create({
    data: {
      reclamoId: id,
      autoreId: io?.id ?? '',
      // ⚠️ Il nome si COPIA: il filo si legge senza caricare gli utenti, e chi
      // scrive oggi può non essere più in squadra fra sei mesi.
      autoreNome: io?.nome || io?.email || '',
      testo,
      domanda: Boolean(c.domanda) && !rispostaA,
      rispostaA,
    },
  })

  // ⚠️ Il reclamo si segna come toccato: `aggiornatoIl` è quello che dice se
  // qualcuno ci sta lavorando. Una conversazione che non muove la scheda fa
  // sembrare fermo un reclamo su cui si sta discutendo da un'ora.
  await db.reclamo.update({ where: { id }, data: { aggiornatoIl: new Date() } })

  return NextResponse.json({ messaggio })
}
