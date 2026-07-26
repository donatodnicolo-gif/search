import { NextRequest, NextResponse } from 'next/server'
import { annotaSync, sincronizzaOrdini } from '@/lib/sincronizza'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Gli ordini arrivano dal registro centralizzato Deluxy Orders (che a sua volta
// sincronizza Shopify): una sola fonte di verità per tutte le app, con la stessa
// classificazione. Qui se ne tiene una copia recente per lavorarci in inbox.
//
// Questo è il pulsante "Aggiorna" a mano; il giro automatico ogni 15 minuti è in
// /api/cron/ordini. La logica è condivisa: src/lib/sincronizza.ts.
export async function POST(req: NextRequest) {
  const completo = req.nextUrl.searchParams.get('completo') === '1'
  try {
    // `contatti: false` NON è un'ottimizzazione: senza, questo pulsante scade.
    // Il salvataggio in rubrica Google costa ~218 secondi misurati (40 chiamate
    // alla People API) contro i 60 di `maxDuration` qui sopra: la funzione viene
    // uccisa, Vercel risponde 504 con una pagina che non è JSON e l'utente legge
    // "Scarico non riuscito." senza motivo — mentre gli ordini erano già
    // arrivati. È la stessa ragione per cui i contatti sono staccati dal cron dei
    // 15 minuti: li salva /api/cron/contatti (ogni ora, maxDuration 300), e per
    // farlo subito c'è il pulsante "Salva tutti i contatti".
    const esito = await sincronizzaOrdini({ completo, contatti: false })
    await annotaSync({ ok: true, nota: `${esito.scaricati} ordini, ${esito.nuovi} nuovi (a mano)` })
    return NextResponse.json(esito)
  } catch (e) {
    const messaggio = (e as Error).message
    await annotaSync({ ok: false, nota: messaggio })
    return NextResponse.json({ errore: messaggio }, { status: 502 })
  }
}
