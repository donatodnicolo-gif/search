import { NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { ripassaDimensioni } from '@/lib/sync'

// POST /api/dimensioni — riempie la DIMENSIONE REALE (allegati compresi) delle
// mail che ne sono prive, chiedendola al server IMAP. Non scarica contenuti:
// chiede solo i numeri, quindi è veloce anche su archivi grandi.
//
// La chiama la lista quando ordini per dimensione: è lì che il dato serve.
// Torna { aggiornate, finito }: il client ripassa finché non è finito.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  // ⚠️⚠️ `utenteCorrente()` e NON `verificaSessione()`: la firma del cookie dice
  // solo «questo biglietto l'abbiamo emesso noi», non rilegge l'utente, quindi
  // non si accorge che è stato DISATTIVATO. Il cookie dura 30 giorni e queste
  // rotte fanno cose vere (allegati, riletture IMAP, una svuota il cestino PER
  // SEMPRE): chi lascia l'azienda continuerebbe a usarle per un mese. Le
  // pagine il controllo lo fanno già — è la trappola «auth riscritta dentro la
  // rotta», qui moltiplicata per nove.
  const userId = (await utenteCorrente())?.id ?? null
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    const aggiornate = await ripassaDimensioni(userId)
    return NextResponse.json({ ok: true, aggiornate, finito: aggiornate === 0 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message.slice(0, 160) : 'errore' },
      { status: 500 }
    )
  }
}
