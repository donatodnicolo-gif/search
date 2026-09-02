import { NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { sincronizzaUtente } from '@/lib/sync'
import { db } from '@/lib/db'

// POST /api/leggi-posta — legge la posta nuova dell'utente loggato.
//
// È una ROTTA (non una Server Action) apposta: le Server Action di Next si
// mettono in coda con le navigazioni, quindi una lettura lunga bloccherebbe i
// clic. Con una fetch a una rotta la lettura gira per conto suo e l'interfaccia
// resta libera. La lettura qui è già breve (giro NON a esaurimento).
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

    // ⚠️ «Nuovi» dice quanti ne ha scaricati QUESTA chiamata — ma il CRON gira
    // ogni 5 minuti e di solito vince la corsa: il client trovava sempre 0 e
    // non aggiornava mai la lista, che restava ferma per ore mentre il
    // database si riempiva (02/09/2026: «io continuo a vedere questo», con 5
    // mail nuove in archivio e la vista ferma alle 14:42). `ultimoArrivo` dice
    // invece quando è ENTRATO l'ultimo messaggio, da chiunque sia stato
    // scaricato: è il segnale giusto per capire se la vista è indietro.
    const ultimo = await db.messaggio.aggregate({
      where: { utenteId: userId, direzione: 'entrata' },
      _max: { creatoIl: true },
    })

    return NextResponse.json({
      ok: note.length === 0,
      nuovi,
      messaggio,
      ultimoArrivo: ultimo._max.creatoIl?.toISOString() ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
