import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { db } from '@/lib/db'
import { cercaEImporta } from '@/lib/sync'

// GET /api/v1/messaggi?email=<contatto>&limite=10 — le ultime mail RICEVUTE da
// quel contatto nella casella dell'utente (per la scheda cliente di Scout).
// Se in locale non c'è nulla, PRIMA di rispondere "vuoto" cerca sul server IMAP
// (che vede tutta la casella, anche la posta mai scaricata) e importa i risultati.
//   header: x-api-key: <API_TOKEN>   x-utente: <email utente AI Mail>
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await autenticaApi(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  const url = new URL(request.url)
  const email = (url.searchParams.get('email') || '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, errore: 'Manca il parametro ?email=<contatto>.' }, { status: 400 })
  }
  const limite = Math.min(Math.max(parseInt(url.searchParams.get('limite') || '10', 10) || 10, 1), 30)

  const query = () =>
    db.messaggio.findMany({
      where: {
        utenteId: auth.utenteId,
        direzione: 'entrata',
        cestinato: false,
        mittente: { equals: email, mode: 'insensitive' },
      },
      orderBy: { data: 'desc' },
      take: limite,
      select: {
        id: true, mittente: true, mittenteNome: true, oggetto: true,
        data: true, anteprima: true, letto: true, allegati: true,
      },
    })

  let righe = await query()
  let cercatoSulServer = false
  // Niente in locale: chiedi al server IMAP (importa) e riprova prima di dire vuoto.
  if (!righe.length) {
    cercatoSulServer = true
    await cercaEImporta(auth.utenteId, email).catch(() => {})
    righe = await query()
  }

  return NextResponse.json({
    ok: true,
    contatto: email,
    cercatoSulServer,
    messaggi: righe.map((m) => ({
      id: m.id,
      da: m.mittenteNome || m.mittente,
      email: m.mittente,
      oggetto: m.oggetto,
      data: m.data,
      anteprima: m.anteprima,
      letto: m.letto,
      allegati: m.allegati,
    })),
  })
}
