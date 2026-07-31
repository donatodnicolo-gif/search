import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { traduciInItaliano, traduciVerso } from '@/lib/ai'
import { daTradurre, linguaDelTesto, lingueLette } from '@/lib/lingua-testo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Traduce i messaggi di una conversazione.
//
// ⚠️ NON SI TRADUCE DENTRO IL WEBHOOK. Una chiamata a OpenAI sono secondi: messa
// nel percorso che riceve i messaggi da Meta allungherebbe la risposta e — se
// OpenAI è lento — manderebbe il webhook in timeout, cioè farebbe PERDERE
// messaggi. Stessa lezione della rubrica Google. Qui si traduce quando qualcuno
// APRE la conversazione: è il momento in cui serve, ed è un momento in cui
// aspettare un secondo è normale.
//
// La traduzione si salva: riaprire la conversazione non deve ricomprarla.

/** Quanti messaggi al massimo per chiamata: gli ultimi sono quelli che contano. */
const TETTO = 12

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { verso?: string; testo?: string }

  // ── Verso il cliente: si traduce una bozza, non si manda niente ──
  //
  // Quello che esce da qui lo legge un cliente, quindi torna nel riquadro di
  // scrittura e parte solo se una persona preme Invia.
  if (body.verso) {
    const testo = (body.testo ?? '').trim()
    if (!testo) return NextResponse.json({ errore: 'Niente da tradurre.' }, { status: 400 })
    const esito = await traduciVerso(testo, body.verso)
    if (esito.stato === 'non-configurato') {
      return NextResponse.json(
        { errore: 'Traduzione non attiva: manca la chiave OpenAI (Impostazioni).' },
        { status: 400 }
      )
    }
    if (esito.stato === 'errore') {
      return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
    }
    return NextResponse.json({ testo: esito.testo, fornitore: esito.fornitore })
  }

  // ── In arrivo: si traduce in italiano quello che non leggiamo ──
  const conf = await leggiImpostazioni(['lingueLette'])
  const lette = lingueLette(conf.lingueLette)

  const messaggi = await db.messaggio.findMany({
    where: { conversazioneId: id, direzione: 'in', traduzione: '' },
    orderBy: { creatoIl: 'desc' },
    take: TETTO,
  })

  let tradotti = 0
  let errore = ''
  for (const m of messaggi) {
    // La lingua si riconosce in codice: gratis, e serve anche solo per sapere
    // che NON va tradotto.
    const lingua = m.lingua || linguaDelTesto(m.testo)
    if (lingua !== m.lingua) {
      await db.messaggio.update({ where: { id: m.id }, data: { lingua } })
    }
    if (!daTradurre(lingua, lette)) continue

    const esito = await traduciInItaliano(m.testo)
    if (esito.stato !== 'ok') {
      // Un errore non blocca gli altri: si prova a tradurre il resto e si dice
      // com'è andata. Mezza conversazione tradotta è meglio di zero.
      errore = esito.stato === 'non-configurato' ? 'Manca la chiave OpenAI (Impostazioni).' : esito.messaggio
      continue
    }
    await db.messaggio.update({
      where: { id: m.id },
      data: { traduzione: esito.testo, lingua },
    })
    tradotti++
  }

  return NextResponse.json({ tradotti, errore })
}
