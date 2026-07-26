import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaPagina, inviaWhatsApp } from '@/lib/meta'
import { configEmail, inviaEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Messaggi di una conversazione. Aprire il thread azzera i non letti.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id } })
  if (!conversazione) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  const messaggi = await db.messaggio.findMany({
    where: { conversazioneId: id },
    orderBy: { creatoIl: 'asc' },
    take: 500,
  })
  if (conversazione.nonLetti > 0) {
    await db.conversazione.update({ where: { id }, data: { nonLetti: 0 } })
  }
  return NextResponse.json({ conversazione, messaggi })
}

// Invia una risposta sul canale della conversazione.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id } })
  if (!conversazione) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })

  const { testo } = (await req.json().catch(() => ({}))) as { testo?: string }
  const pulito = (testo ?? '').trim()
  if (!pulito) return NextResponse.json({ errore: 'Testo vuoto' }, { status: 400 })

  const config = await leggiImpostazioni(['waToken', 'waPhoneNumberId', 'fbPageToken', 'igToken'])

  let esito: { ok: true; idEsterno: string } | { ok: false; errore: string }
  switch (conversazione.canale) {
    case 'whatsapp':
      esito =
        config.waToken && config.waPhoneNumberId
          ? await inviaWhatsApp(config.waToken, config.waPhoneNumberId, conversazione.idEsterno, pulito)
          : { ok: false, errore: 'WhatsApp non configurato: token o Phone Number ID mancanti (Impostazioni).' }
      break
    case 'messenger':
      esito = config.fbPageToken
        ? await inviaPagina(config.fbPageToken, conversazione.idEsterno, pulito)
        : { ok: false, errore: 'Messenger non configurato: Page Access Token mancante (Impostazioni).' }
      break
    case 'instagram':
      esito = config.igToken
        ? await inviaPagina(config.igToken, conversazione.idEsterno, pulito)
        : { ok: false, errore: 'Instagram non configurato: token mancante (Impostazioni).' }
      break
    case 'widget':
      // Il widget non ha un invio esterno: il visitatore riceve col suo polling.
      esito = { ok: true, idEsterno: '' }
      break
    case 'email': {
      const config = await configEmail()
      if (!config) {
        esito = { ok: false, errore: 'Casella di posta non configurata (Impostazioni → Email).' }
        break
      }
      // L'oggetto della risposta segue l'ultima mail ricevuta: "Re: …".
      const ultima = await db.messaggio.findFirst({
        where: { conversazioneId: id, direzione: 'in', oggetto: { not: '' } },
        orderBy: { creatoIl: 'desc' },
        select: { oggetto: true },
      })
      const oggetto = ultima?.oggetto
        ? /^re:/i.test(ultima.oggetto)
          ? ultima.oggetto
          : `Re: ${ultima.oggetto}`
        : 'Messaggio da Deluxy'
      try {
        const idMsg = await inviaEmail(config, conversazione.idEsterno, oggetto, pulito)
        esito = { ok: true, idEsterno: idMsg }
      } catch (e) {
        esito = { ok: false, errore: `Invio non riuscito: ${(e as Error).message}` }
      }
      break
    }
    default:
      esito = { ok: false, errore: `Canale sconosciuto: ${conversazione.canale}` }
  }

  const messaggio = await db.messaggio.create({
    data: {
      conversazioneId: id,
      direzione: 'out',
      testo: pulito,
      idEsterno: esito.ok ? esito.idEsterno : '',
      stato: esito.ok ? 'inviato' : 'errore',
      errore: esito.ok ? '' : esito.errore,
    },
  })
  await db.conversazione.update({
    where: { id },
    data: { ultimoTesto: pulito, ultimoMessaggioIl: new Date() },
  })

  if (!esito.ok) return NextResponse.json({ errore: esito.errore, messaggio }, { status: 502 })
  return NextResponse.json({ messaggio })
}
