import { NextRequest, NextResponse } from 'next/server'
import { cercaRefusi } from '@/lib/correttore'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// ⚠️ Corta apposta: il correttore sta nel percorso dell'invio, e la libreria
// si taglia da sola a 2,5 secondi. Se questa rotta impiegasse di più, la
// pagina avrebbe già mandato il messaggio.
export const maxDuration = 15

// Cerca i refusi in un messaggio prima che parta al cliente.
//
// ⚠️ Non corregge e non manda niente: torna solo l'elenco delle proposte. La
// sostituzione la fa la pagina, quando una persona preme «Correggi e manda».
//
// ⚠️ Un errore qui NON deve fermare l'invio: la rotta risponde `200` con
// l'elenco vuoto e `controllato: false`, e la pagina manda. Un correttore che
// blocca le risposte ai clienti è molto peggio di un refuso.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const { testo } = (await req.json().catch(() => ({}))) as { testo?: string }
  if (typeof testo !== 'string' || !testo.trim()) {
    return NextResponse.json({ refusi: [], controllato: false })
  }

  try {
    return NextResponse.json(await cercaRefusi(testo))
  } catch {
    return NextResponse.json({ refusi: [], controllato: false })
  }
}
