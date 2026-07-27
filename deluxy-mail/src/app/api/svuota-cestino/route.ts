import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { svuotaCestinoDi } from '@/lib/cestino'

// POST /api/svuota-cestino — svuota il cestino dell'utente loggato.
//
// ⚠️ È una ROTTA, non una Server Action, e per lo stesso motivo di
// `/api/leggi-posta`: le Server Action di Next si mettono **in coda con le
// navigazioni**, quindi un lavoro lungo non rallenta soltanto sé stesso —
// blocca i clic ovunque nell'app. Svuotare il cestino è lungo davvero: apre una
// connessione IMAP per casella e, per ogni mail, cerca il suo Message-ID sul
// server prima di cancellarla (è quella ricerca a rendere la cancellazione
// sicura, vedi `eliminaDalServer`). Con qualche centinaio di mail nel cestino
// sono minuti — minuti in cui l'app pareva piantata.
//
// Con una fetch a questa rotta il lavoro gira per conto suo e l'interfaccia
// resta libera: si può continuare a leggere la posta mentre si svuota.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    return NextResponse.json(await svuotaCestinoDi(userId))
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
