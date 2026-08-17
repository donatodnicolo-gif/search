import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { urlMediaWhatsApp } from '@/lib/meta'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ id: string }> }

/**
 * Il ponte verso i file di WhatsApp: `id` è il MESSAGGIO, non il media.
 *
 * ⚠️ L'indirizzo che dà Meta vale pochi minuti e **vuole il token** anche solo
 * per leggerlo: messo come `src` di una `<img>` risponderebbe 401. E passare
 * dal messaggio invece che dal media id non è un vezzo — è così che sappiamo
 * QUALE token usare (quello del numero che ha ricevuto) e che un id indovinato
 * a caso non tira fuori la foto di un altro cliente.
 *
 * La rotta sta dietro il middleware di sessione: la vede solo chi è dentro.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const messaggio = await db.messaggio.findUnique({
    where: { id },
    select: {
      mediaId: true,
      mediaUrl: true,
      mimeType: true,
      nomeFile: true,
      conversazione: { select: { numeroId: true, canale: true } },
    },
  })
  if (!messaggio?.mediaId && !messaggio?.mediaUrl) {
    return NextResponse.json({ errore: 'Nessun file per questo messaggio' }, { status: 404 })
  }

  // ── Instagram e Messenger: l'indirizzo ce l'abbiamo già ──
  //
  // Lì Meta non dà un id da richiedere: manda un indirizzo firmato, e quello è
  // tutto. Si scarica **dal server** e non si mette come `src` di una `<img>`
  // per due motivi: l'indirizzo è una chiave d'accesso alla foto di un cliente e
  // non deve uscire dall'app, e il browser dell'operatore non deve andare a
  // bussare a un dominio di Meta per ogni messaggio.
  if (messaggio.mediaUrl) {
    const file = await fetch(messaggio.mediaUrl)
    if (!file.ok || !file.body) {
      // ⚠️ Questo indirizzo SCADE, e quando scade il file non c'è più da nessuna
      // parte: non ne teniamo copia. Dirlo per quello che è vale più di
      // un'immagine rotta, che chi guarda leggerebbe come un guasto dell'app.
      return NextResponse.json(
        {
          errore:
            file.status === 404 || file.status === 403 || file.status === 410
              ? 'Meta non tiene più questo file: l’indirizzo che ci aveva dato è scaduto.'
              : `Scaricamento non riuscito (${file.status}).`,
        },
        { status: 502 }
      )
    }
    return new NextResponse(file.body, {
      headers: {
        // Il tipo vero lo dice il server di Meta; il nostro è solo una stima
        // fatta dal tipo dell'allegato, quindi cede il passo.
        'Content-Type':
          file.headers.get('content-type') || messaggio.mimeType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  }

  if (messaggio.conversazione.canale !== 'whatsapp') {
    return NextResponse.json({ errore: 'Canale senza allegati' }, { status: 400 })
  }

  const token = await tokenPerNumero(messaggio.conversazione.numeroId)
  if (!token) return NextResponse.json({ errore: 'Token mancante' }, { status: 400 })

  const indirizzo = await urlMediaWhatsApp(token, messaggio.mediaId)
  if (!indirizzo.ok) {
    // Dopo ~30 giorni Meta il file non ce l'ha più: dirlo è meglio di un 500.
    return NextResponse.json(
      { errore: `Meta non dà il file: ${indirizzo.errore}` },
      { status: 502 }
    )
  }

  const file = await fetch(indirizzo.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!file.ok || !file.body) {
    return NextResponse.json({ errore: `Scaricamento non riuscito (${file.status})` }, { status: 502 })
  }

  const tipo = messaggio.mimeType || indirizzo.mimeType || 'application/octet-stream'
  return new NextResponse(file.body, {
    headers: {
      'Content-Type': tipo,
      // I file non cambiano mai: si possono tenere nel browser. `private`
      // perché sono messaggi di clienti, non roba da CDN condivise.
      'Cache-Control': 'private, max-age=3600',
      ...(messaggio.nomeFile
        ? { 'Content-Disposition': `inline; filename="${encodeURIComponent(messaggio.nomeFile)}"` }
        : {}),
    },
  })
}
