import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'
import { sincronizzaUtente } from '@/lib/sync'

// POST /api/leggi-posta — legge la posta nuova dell'utente loggato.
//
// È una ROTTA (non una Server Action) apposta: le Server Action di Next si
// mettono in coda con le navigazioni, quindi una lettura lunga bloccherebbe i
// clic. Con una fetch a una rotta la lettura gira per conto suo e l'interfaccia
// resta libera. La lettura qui è già breve (giro NON a esaurimento).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const esiti = await sincronizzaUtente(userId)
    if (esiti.length === 0) {
      return NextResponse.json({ ok: false, messaggio: 'Nessuna casella collegata: aggiungila in Impostazioni.' })
    }

    const errori = esiti.filter((e) => e.errore)
    if (errori.length) {
      return NextResponse.json({ ok: false, messaggio: `Errore su ${errori[0].account}: ${errori[0].errore}` })
    }

    const nuovi = esiti.reduce((s, e) => s + e.scaricati, 0)
    const rimandati = esiti.reduce((s, e) => s + e.nonSalvati, 0)
    const scartati = esiti.reduce((s, e) => s + e.scartati, 0)

    const note: string[] = []
    if (rimandati > 0) note.push(`${rimandati} li riprendo al prossimo giro (database occupato)`)
    if (scartati > 0) note.push(`${scartati} scartati perché illeggibili`)
    const avviso = note.length ? ` ${note.join(', ')}.` : ''

    const messaggio =
      nuovi === 0
        ? `Nessun messaggio nuovo.${avviso}`
        : `${nuovi} messaggi nuovi. Dai una priorità a quelli che contano: l’AI li analizza e crea le attività.${avviso}`

    return NextResponse.json({ ok: note.length === 0, nuovi, messaggio })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
