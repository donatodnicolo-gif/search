import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { inviaMailApi } from '@/lib/actions'

// POST /api/v1/invia — invia una mail dalla casella di un utente AI Mail.
//   header:  x-api-key: <API_TOKEN>   x-utente: <email utente AI Mail>
//   body JSON: { "a": "...", "cc": "...", "oggetto": "...", "corpo": "..." }
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await autenticaApi(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  let body: { a?: string; cc?: string; oggetto?: string; corpo?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, errore: 'Corpo della richiesta non è JSON valido.' }, { status: 400 })
  }

  const esito = await inviaMailApi(auth.utenteId, {
    a: body.a ?? '',
    cc: body.cc,
    oggetto: body.oggetto ?? '',
    corpo: body.corpo ?? '',
  })
  return NextResponse.json(esito, { status: esito.ok ? 200 : 400 })
}
