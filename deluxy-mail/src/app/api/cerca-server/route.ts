import { NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { cercaEImporta } from '@/lib/sync'

// POST /api/cerca-server { q } — fa cercare al server IMAP (che vede tutta la
// casella, anche la posta mai scaricata) e IMPORTA le mail trovate: la ricerca
// locale che segue le vede. È una rotta (non una Server Action) così gira in
// background senza bloccare i clic.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  // ⚠️⚠️ `utenteCorrente()` e NON `verificaSessione()`: la firma del cookie dice
  // solo «questo biglietto l'abbiamo emesso noi», non rilegge l'utente, quindi
  // non si accorge che è stato DISATTIVATO. Il cookie dura 30 giorni e queste
  // rotte fanno cose vere (allegati, riletture IMAP, una svuota il cestino PER
  // SEMPRE): chi lascia l'azienda continuerebbe a usarle per un mese. Le
  // pagine il controllo lo fanno già — è la trappola «auth riscritta dentro la
  // rotta», qui moltiplicata per nove.
  const userId = (await utenteCorrente())?.id ?? null
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const { q } = (await request.json().catch(() => ({}))) as { q?: string }
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ ok: true, importati: 0 })
    }
    const { importati } = await cercaEImporta(userId, q)
    return NextResponse.json({ ok: true, importati })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
