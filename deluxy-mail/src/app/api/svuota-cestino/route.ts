import { NextResponse, after } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { eseguiSvuotaCestino, leggiStatoSvuota, prenotaSvuotaCestino } from '@/lib/cestino'

// /api/svuota-cestino — svuota il cestino dell'utente loggato.
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
// ⚠️ E il lavoro NON deve dipendere dalla pagina aperta. Prima girava dentro la
// fetch del browser: cambiando schermata la richiesta se ne andava col
// componente, lo svuotamento si fermava a metà e dell'esito non restava
// traccia. Ora il POST **prenota** il lavoro e risponde subito; il lavoro vero
// gira in `after()`, cioè nella stessa invocazione ma dopo che la risposta è
// partita, quindi continua anche se chi l'ha lanciato cambia schermata o chiude
// la scheda. L'avanzamento si chiede col GET: è così che il lavoro si ritrova
// tornando sul cestino, invece di sparire.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function utenteDellaSessione() {
  // ⚠️⚠️ `utenteCorrente()` e NON `verificaSessione()`: la firma del cookie dice
  // solo «questo biglietto l'abbiamo emesso noi», non rilegge l'utente, quindi
  // non si accorge che è stato DISATTIVATO. Il cookie dura 30 giorni e queste
  // rotte fanno cose vere (allegati, riletture IMAP, una svuota il cestino PER
  // SEMPRE): chi lascia l'azienda continuerebbe a usarle per un mese. Le
  // pagine il controllo lo fanno già — è la trappola «auth riscritta dentro la
  // rotta», qui moltiplicata per nove.
  return (await utenteCorrente())?.id ?? null
}

export async function POST() {
  const userId = await utenteDellaSessione()
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }

  try {
    const avvio = await prenotaSvuotaCestino(userId)
    if (!avvio.avviato) {
      return NextResponse.json({ ok: false, messaggio: avvio.messaggio, stato: await leggiStatoSvuota(userId) })
    }

    // Il lavoro vero, dopo la risposta. Gli errori finiscono nello stato, che
    // la pagina legge col GET: qui non c'è più nessuno ad ascoltarli.
    after(() => eseguiSvuotaCestino(userId).catch(() => {}))

    return NextResponse.json({
      ok: true,
      avviato: true,
      messaggio: avvio.messaggio,
      stato: await leggiStatoSvuota(userId),
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, messaggio: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}

/** A che punto è (o com'è finito). La pagina del cestino lo chiede anche appena
 *  aperta: è così che uno svuotamento avviato prima si ritrova. */
export async function GET() {
  const userId = await utenteDellaSessione()
  if (!userId) {
    return NextResponse.json({ ok: false, messaggio: 'Sessione scaduta: rientra.' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, stato: await leggiStatoSvuota(userId) })
}
