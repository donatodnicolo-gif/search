import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scaricaStorico, sincronizzaTutti, type EsitoSync } from '@/lib/sync'
import { sincronizzaAttivitaConRegistro } from '@/lib/registroTask'
import { sincronizzaEventiConRegistro } from '@/lib/registroCalendario'
import { pulisciHtmlVecchio } from '@/lib/htmlServer'

// La sincronizzazione periodica gira da qui: un cron esterno (Vercel Cron,
// Task Scheduler, cron di sistema) chiama questa rotta ogni pochi minuti.
// Con il token in query, così funziona anche da un cron che non manda header.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  // Il cron di Vercel non può mettere il token nell'URL: chiama la rotta con
  // "Authorization: Bearer $CRON_SECRET". In locale invece è comodo il token
  // in query, quindi si accettano entrambi.
  const atteso = process.env.CRON_TOKEN || process.env.CRON_SECRET
  if (!atteso) {
    return NextResponse.json(
      { errore: 'CRON_TOKEN non configurato: la sincronizzazione automatica è disattivata.' },
      { status: 503 }
    )
  }

  const parametri = new URL(request.url).searchParams
  const token =
    parametri.get('token') ?? request.headers.get('authorization')?.replace('Bearer ', '')

  if (token !== atteso) {
    return NextResponse.json({ errore: 'Non autorizzato' }, { status: 401 })
  }

  try {
    // ?storico=25 scarica un blocco di posta vecchia invece dei messaggi nuovi.
    // Non è quello che fa il cron: serve a recuperare l'archivio quando lo
    // chiedi, dall'app o da uno script.
    const storico = parametri.get('storico')
    if (storico) {
      const quanti = Math.min(Number(storico) || 25, 100)
      const account = await db.account.findMany({ where: { attivo: true } })
      const esiti: EsitoSync[] = []
      for (const a of account) esiti.push(await scaricaStorico(a.id, quanti))
      return NextResponse.json({ ok: true, esiti })
    }

    const forza = parametri.get('forzaRegistro') === '1'

    // ⚠️ I REGISTRI CONDIVISI VANNO PER PRIMI, e non è un dettaglio d'ordine.
    //
    // Stavano in fondo, dopo la lettura della posta. Ma `sincronizzaTutti()`
    // esaurisce da sola i 300 secondi di budget della funzione su Vercel — nei
    // log di produzione ogni giro del cron finiva con «Task timed out after 300
    // seconds» — e la funzione veniva uccisa PRIMA di arrivare qui. Risultato:
    // il codice che manda le attività a Tasks non è mai stato eseguito nemmeno
    // una volta (nel registro la chiave di AI Mail risultava «mai usata»), e da
    // fuori sembrava semplicemente che la sincronizzazione non funzionasse.
    //
    // Costano pochi secondi: messi in testa girano SEMPRE, anche quando la
    // lettura della posta va oltre il tempo e viene interrotta.
    const registro = await sincronizzaAttivitaConRegistro({ forza }).catch((e) => ({
      attivo: false,
      inviate: 0,
      invariate: 0,
      ricevute: 0,
      archiviate: 0,
      errori: 0,
      destinatari: [] as string[],
      messaggio: e instanceof Error ? e.message : 'Errore imprevisto',
    }))

    // Stessa cosa per gli appuntamenti col calendario condiviso: gemello del
    // registro Attività, stessa logica nei due sensi.
    const calendario = await sincronizzaEventiConRegistro({ forza }).catch((e) => ({
      attivo: false,
      inviati: 0,
      invariati: 0,
      ricevuti: 0,
      archiviati: 0,
      errori: 0,
      messaggio: e instanceof Error ? e.message : 'Errore imprevisto',
    }))

    // PULIZIA GRADUALE dell'HTML vecchio: mille mail a giro, così il database
    // resta piccolo per sempre invece di ricrescere fino al prossimo blocco a
    // disco pieno. L'impaginato non si perde: si riprende dal server
    // all'apertura (lib/htmlServer.ts).
    //
    // ⚠️ PRIMA della lettura della posta, per la stessa ragione dei registri
    // qui sopra: la lettura esaurisce da sola i 300 secondi e viene uccisa —
    // qualunque cosa stia dopo di lei NON GIRA MAI. L'avevo messa dopo
    // («dopo la posta, mai al suo posto») ed era la terza volta che questa
    // rotta insegnava la stessa lezione: ciò che deve girare comunque non si
    // mette dietro ciò che può non finire. Costa pochi secondi.
    const htmlAlleggeriti = await pulisciHtmlVecchio().catch(() => 0)
    if (htmlAlleggeriti > 0) console.log(`[AI Mail] pulizia HTML: alleggerite ${htmlAlleggeriti} mail vecchie.`)

    // ?soloRegistro=1 — solo registri e pulizia, senza leggere la posta:
    // risponde in pochi secondi, senza il muro dei 300.
    if (parametri.get('soloRegistro') === '1') {
      return NextResponse.json({ ok: true, registro, calendario, htmlAlleggeriti })
    }

    const esiti = await sincronizzaTutti()

    return NextResponse.json({ ok: true, esiti, registro, calendario, htmlAlleggeriti })
  } catch (e) {
    return NextResponse.json(
      { ok: false, errore: e instanceof Error ? e.message : 'Errore imprevisto' },
      { status: 500 }
    )
  }
}
