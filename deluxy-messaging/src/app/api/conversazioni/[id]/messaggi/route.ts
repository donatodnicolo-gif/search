import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaPagina, inviaWhatsApp } from '@/lib/meta'
import { casellaPerId, inviaEmail } from '@/lib/email'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { utenteCorrente } from '@/lib/sessione'

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

  // Chi sta rispondendo: con più operatori, «chi ha scritto al cliente» è la
  // prima domanda quando la conversazione passa di mano.
  const chiScrive = await utenteCorrente()
  const config = await leggiImpostazioni(['waToken', 'waPhoneNumberId', 'fbPageToken', 'igToken'])

  let esito: { ok: true; idEsterno: string } | { ok: false; errore: string }
  switch (conversazione.canale) {
    case 'whatsapp': {
      // ⚠️ SI RISPONDE DAL NUMERO CHE HA RICEVUTO, non da quello impostato.
      //
      // La holding ha più WhatsApp Business (Deluxy Flowers, Cake Design,
      // Deluxy Cake Delivery…). Con un solo `waPhoneNumberId` nelle
      // Impostazioni, a un cliente che ha scritto ai fiori avremmo risposto dal
      // numero della pasticceria: dal suo telefono è un'altra azienda che gli
      // scrive di punto in bianco su un ordine che non ha fatto lì.
      // `numeroId` della conversazione è quello vero, letto dal webhook di Meta;
      // l'impostazione resta come ripiego per le conversazioni vecchie, che il
      // numero non l'hanno registrato.
      const numeroDaCuiRispondere = conversazione.numeroId || config.waPhoneNumberId
      // Ogni numero può avere il suo token (account Meta diversi); se non ce
      // l'ha si usa quello generale delle Impostazioni.
      const tokenDiQuelNumero = await tokenPerNumero(numeroDaCuiRispondere)
      esito =
        tokenDiQuelNumero && numeroDaCuiRispondere
          ? await inviaWhatsApp(
              tokenDiQuelNumero,
              numeroDaCuiRispondere,
              conversazione.idEsterno,
              pulito
            )
          : {
              ok: false,
              errore: 'WhatsApp non configurato: token o Phone Number ID mancanti (Impostazioni).',
            }
      break
    }
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
      // Si risponde dalla casella che ha ricevuto; se non c'è, dalla predefinita.
      const casella = await casellaPerId(conversazione.casellaId)
      if (!casella) {
        esito = { ok: false, errore: 'Nessuna casella di posta configurata (pagina Caselle).' }
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
        const idMsg = await inviaEmail(casella, conversazione.idEsterno, oggetto, pulito)
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
      utenteId: chiScrive?.id ?? '',
      utenteNome: chiScrive?.nome ?? '',
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
