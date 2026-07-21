import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { analizzaContattoOra } from '@/lib/sync'

// GET /api/v1/contatto?email=<contatto> — Renè fa il punto della situazione
// sulle conversazioni mail con quel contatto (situazione + cose in sospeso +
// prossime azioni), sui messaggi già scaricati nella casella dell'utente.
//   header: x-api-key: <API_TOKEN>   x-utente: <email utente AI Mail>
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await autenticaApi(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  const email = (new URL(request.url).searchParams.get('email') || '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, errore: 'Manca il parametro ?email=<contatto>.' }, { status: 400 })
  }

  const esito = await analizzaContattoOra(auth.utenteId, email)
  if (!esito.ok || !esito.quadro) {
    return NextResponse.json({ ok: false, errore: esito.messaggio }, { status: 404 })
  }

  const q = esito.quadro
  return NextResponse.json({
    ok: true,
    contatto: email,
    situazione: q.situazione,
    inSospeso: q.taskAperti,
    prossimeAzioni: q.azioni.map((a) => ({
      titolo: a.titolo,
      dettaglio: a.dettaglio,
      priorita: a.priorita,
      scadenza: a.scadenza,
    })),
    messaggiVisti: q.messaggiVisti,
    aggiornatoIl: q.aggiornatoIl,
  })
}
