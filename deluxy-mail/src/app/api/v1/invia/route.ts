import { NextResponse } from 'next/server'
import { autenticaApi } from '@/lib/apiAuth'
import { inviaMailApi } from '@/lib/actions'

// POST /api/v1/invia — invia una mail dalla casella di un utente AI Mail.
//   header:  x-api-key: <API_TOKEN>   x-utente: <email utente AI Mail>
//   body JSON: { "a": "...", "cc": "...", "oggetto": "...", "corpo": "...",
//                "corpoHtml": "<p>…</p>" }
//
// `corpoHtml` (alias `html`) è il corpo formattato. Si può anche mandare
// direttamente dell'HTML in `corpo`: viene riconosciuto. Chi manda testo
// semplice non deve cambiare niente.
//
// La mail parte dalla casella dell'utente e **la copia finisce nella cartella
// «Inviata» del server** (più la registrazione in AI Mail): è la ragione per
// cui un'altra app conviene che mandi da qui invece che con un SMTP suo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await autenticaApi(request)
  if (!auth.ok) return NextResponse.json({ ok: false, errore: auth.errore }, { status: auth.status })

  let body: {
    a?: string; cc?: string; oggetto?: string; corpo?: string; corpoHtml?: string; html?: string
    allegati?: { nome: string; contenuto: string; tipo?: string }[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, errore: 'Corpo della richiesta non è JSON valido.' }, { status: 400 })
  }

  // Se `x-utente` era l'email di una CASELLA (non di un utente), la mail
  // parte proprio da quella casella — non dalla prima dell'utente.
  const esito = await inviaMailApi(auth.utenteId, {
    a: body.a ?? '',
    cc: body.cc,
    oggetto: body.oggetto ?? '',
    corpo: body.corpo ?? '',
    corpoHtml: body.corpoHtml ?? body.html,
    // ⭐ 27/08/2026: ALLEGATI. Chiesti dalla piattaforma consegne, che manda al
    // valet il recap paghe e la RICEVUTA da firmare: dentro il corpo della mail
    // non si stampano bene e non si archiviano.
    //   allegati: [{ nome: 'ricevuta.html', contenuto: '<base64>', tipo: 'text/html' }]
    // Il contenuto e' base64 SENZA il prefisso `data:`. Massimo 8 MB in tutto.
    allegati: Array.isArray(body.allegati) ? body.allegati : undefined,
  }, auth.accountEmail)
  return NextResponse.json(esito, { status: esito.ok ? 200 : 400 })
}
