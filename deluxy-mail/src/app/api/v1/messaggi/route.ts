import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { db } from '@/lib/db'
import { cercaEImporta } from '@/lib/sync'

// GET /api/v1/messaggi?email=<contatto>&da=<ISO>&a=<ISO>&server=1&limite=30
// Le mail RICEVUTE da quel contatto in una FINESTRA temporale (default: ultimi
// 30 giorni). Due modalità, così la scheda Scout è veloce:
//   - senza server=1: solo il DB locale (risposta immediata);
//   - con server=1: prima cerca sul server IMAP e importa, poi risponde (lento,
//     va chiamato in background dopo aver già mostrato i risultati locali).
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
  const limite = Math.min(Math.max(parseInt(url.searchParams.get('limite') || '30', 10) || 30, 1), 100)

  // Finestra temporale: default ultimi 30 giorni.
  const parseData = (v: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  const a = parseData(url.searchParams.get('a')) ?? new Date()
  const da = parseData(url.searchParams.get('da')) ?? new Date(a.getTime() - 30 * 24 * 60 * 60 * 1000)

  const query = () =>
    db.messaggio.findMany({
      where: {
        utenteId: auth.utenteId,
        direzione: 'entrata',
        cestinato: false,
        mittente: { equals: email, mode: 'insensitive' },
        data: { gte: da, lte: a },
      },
      orderBy: { data: 'desc' },
      take: limite,
      select: {
        id: true, mittente: true, mittenteNome: true, oggetto: true,
        data: true, anteprima: true, letto: true, allegati: true,
      },
    })

  // La ricerca sul server IMAP (lenta) solo se richiesta esplicitamente.
  let cercatoSulServer = false
  if (url.searchParams.get('server') === '1') {
    cercatoSulServer = true
    await cercaEImporta(auth.utenteId, email).catch(() => {})
  }

  const righe = await query()
  return NextResponse.json({
    ok: true,
    contatto: email,
    da: da.toISOString(),
    a: a.toISOString(),
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
