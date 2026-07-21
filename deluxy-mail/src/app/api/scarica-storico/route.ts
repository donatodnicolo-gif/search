import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { db } from '@/lib/db'
import { scaricaStorico, sincronizzaInviata } from '@/lib/sync'

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
      select: { id: true, storicoFinito: true, storicoInviataFinito: true },
    })

    let scaricati = 0
    // Per ogni account si avanza SIA la INBOX SIA la cartella "Inviata" nella
    // stessa chiamata: così lo storico degli inviati NON deve aspettare che la
    // posta in arrivo sia finita (prima era gated dietro un break, e con molta
    // posta in arrivo gli inviati passati non arrivavano mai). Ci si ferma dopo
    // il primo account che ha scaricato qualcosa: il client richiama subito.
    for (const a of account) {
      let fatto = false
      if (!a.storicoFinito) {
        const esito = await scaricaStorico(a.id, BLOCCO)
        scaricati += esito.scaricati
        if (esito.scaricati > 0) fatto = true
      }
      if (!a.storicoInviataFinito) {
        const esito = await sincronizzaInviata(a.id, true)
        scaricati += esito.scaricati
        if (esito.scaricati > 0) fatto = true
      }
      if (fatto) break
    }

    const restanti = await db.account.count({
      where: {
        utenteId: userId,
        attivo: true,
        OR: [{ storicoFinito: false }, { storicoInviataFinito: false }],
      },
    })

    return NextResponse.json({ ok: true, scaricati, finito: restanti === 0 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
