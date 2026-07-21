import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { scaricaStorico } from '@/lib/sync'

// POST /api/scarica-storico — scarica UN blocco di posta vecchia (storico) per
// l'utente loggato, un account alla volta. Torna { scaricati, finito }:
// `finito` = tutte le caselle hanno lo storico completo. Il client chiama
// questa rotta in loop (in background) finché non è finito, così l'app resta
// libera mentre la posta vecchia arriva a poco a poco.
//
// È una ROTTA (non una Server Action) apposta: non entra nella coda delle
// navigazioni/azioni di Next, quindi non blocca i clic dell'utente.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BLOCCO = 80 // messaggi vecchi per chiamata

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const account = await db.account.findMany({
      where: { utenteId: userId, attivo: true },
      select: { id: true, storicoFinito: true },
    })

    let scaricati = 0
    // Un blocco per l'account che ha ancora storico da prendere. Ci si ferma al
    // primo che scarica qualcosa: il client richiama subito per il prossimo
    // blocco, così ogni chiamata resta breve e l'app non rallenta.
    for (const a of account) {
      if (a.storicoFinito) continue
      const esito = await scaricaStorico(a.id, BLOCCO)
      scaricati += esito.scaricati
      if (esito.scaricati > 0) break
    }

    const restanti = await db.account.count({
      where: { utenteId: userId, attivo: true, storicoFinito: false },
    })

    return NextResponse.json({ ok: true, scaricati, finito: restanti === 0 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
