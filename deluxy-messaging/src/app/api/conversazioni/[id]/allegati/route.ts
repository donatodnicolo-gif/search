import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import {
  caricaMediaWhatsApp,
  inviaMediaWhatsApp,
  tipoMediaWhatsApp,
} from '@/lib/meta'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Caricare su Meta e poi inviare sono due chiamate: con una foto pesante e una
// rete lenta i 10 secondi di default non bastano.
export const maxDuration = 60

/**
 * ⚠️ Il tetto NON è una scelta di stile: la richiesta passa da una funzione
 * serverless, che accetta al massimo ~4,5 MB di corpo. Un file più grande non
 * arriva nemmeno qui — muore prima con un errore che non spiega niente. Meglio
 * dirlo noi, e dirlo prima di far aspettare.
 */
const TETTO_BYTE = 4 * 1024 * 1024

type Params = { params: Promise<{ id: string }> }

// Manda un file su WhatsApp: si carica su Meta, si ottiene un id e si invia
// quell'id. Nessuna copia resta da noi.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id } })
  if (!conversazione) {
    return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  }
  if (conversazione.canale !== 'whatsapp') {
    // Gli altri canali si mandano in modi diversi (SMTP per le mail, altre
    // rotte per Messenger e Instagram): dire «non ancora» è più onesto che
    // provarci e far fallire l'invio con un errore di Meta.
    return NextResponse.json(
      { errore: 'Gli allegati per ora partono solo su WhatsApp.' },
      { status: 400 }
    )
  }

  const modulo = await req.formData().catch(() => null)
  const file = modulo?.get('file')
  const didascalia = String(modulo?.get('didascalia') ?? '').trim()
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ errore: 'Nessun file' }, { status: 400 })
  }
  if (file.size > TETTO_BYTE) {
    return NextResponse.json(
      {
        errore: `Il file pesa ${(file.size / 1024 / 1024).toFixed(1)} MB: il massimo è 4 MB. Per uno più grande, mandane il link.`,
      },
      { status: 413 }
    )
  }

  const chiScrive = await utenteCorrente()
  // ⚠️ Il cookie è `userId.HMAC(userId)` e vive trenta giorni: il middleware
  // ne verifica solo la FIRMA, e cancellare un utente non lo invalida. Senza
  // questa riga l'azione partiva lo stesso, con autore vuoto in archivio.
  if (!chiScrive) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const config = await leggiImpostazioni(['waPhoneNumberId'])
  // Stessa regola dei messaggi di testo: si risponde DAL NUMERO CHE HA
  // RICEVUTO, non da quello impostato.
  const numeroDaCuiRispondere = conversazione.numeroId || config.waPhoneNumberId
  const token = await tokenPerNumero(numeroDaCuiRispondere)
  if (!token || !numeroDaCuiRispondere) {
    return NextResponse.json(
      { errore: 'WhatsApp non configurato: token o Phone Number ID mancanti.' },
      { status: 400 }
    )
  }

  const tipo = tipoMediaWhatsApp(file.type)
  const caricato = await caricaMediaWhatsApp(token, numeroDaCuiRispondere, file)
  if (!caricato.ok) {
    return NextResponse.json({ errore: `Caricamento non riuscito: ${caricato.errore}` }, { status: 502 })
  }

  const esito = await inviaMediaWhatsApp(token, numeroDaCuiRispondere, conversazione.idEsterno, {
    id: caricato.mediaId,
    tipo,
    nome: file.name,
    didascalia,
  })

  // La riga resta scritta anche quando l'invio fallisce: «l'ho mandata o no?»
  // è la prima domanda, e una chat che dimentica i tentativi non risponde.
  const etichetta = didascalia || (tipo === 'document' ? file.name : `[${tipo}]`)
  const messaggio = await db.messaggio.create({
    data: {
      conversazioneId: id,
      direzione: 'out',
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
      testo: etichetta,
      tipo: 'media',
      mediaId: caricato.mediaId,
      mimeType: file.type,
      nomeFile: file.name,
      idEsterno: esito.ok ? esito.idEsterno : '',
      stato: esito.ok ? 'inviato' : 'errore',
      errore: esito.ok ? '' : esito.errore,
    },
  })
  await db.conversazione.update({
    where: { id },
    data: { ultimoTesto: etichetta, ultimoMessaggioIl: new Date() },
  })

  if (!esito.ok) return NextResponse.json({ errore: esito.errore, messaggio }, { status: 502 })
  return NextResponse.json({ messaggio })
}
