import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { inviaPagina, inviaWhatsApp } from '@/lib/meta'
import { casellaPerId, inviaEmail } from '@/lib/email'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { tokenPerPagina } from '@/lib/pagine-meta'
import { utenteCorrente } from '@/lib/sessione'
import { daTradurre, linguaDelTesto, lingueLette } from '@/lib/lingua-testo'

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

  // ── C'è qualcosa da tradurre, qui dentro? ──
  //
  // ⚠️ La domanda si risponde QUI, non nel browser: dipende da quali lingue
  // leggiamo, che è un'impostazione. Mandando al browser un sì/no già deciso si
  // evita che chieda la traduzione di una mail inglese a chi l'inglese lo
  // legge — una chiamata pagata a ogni apertura, per niente.
  const conf = await leggiImpostazioni(['traduzioneAuto', 'lingueLette'])
  const lette = lingueLette(conf.lingueLette)
  const cEDaTradurre = messaggi.some(
    (m) =>
      m.direzione === 'in' && !m.traduzione && daTradurre(m.lingua || linguaDelTesto(m.testo), lette)
  )

  // La lingua del cliente: l'ultima riconosciuta fra i SUOI messaggi. Serve al
  // bottone «Traduci prima di inviare», che deve sapere verso dove tradurre.
  const suoi = messaggi.filter((m) => m.direzione === 'in')
  const linguaCliente =
    [...suoi].reverse().find((m) => m.lingua)?.lingua ??
    linguaDelTesto(suoi[suoi.length - 1]?.testo ?? '')

  return NextResponse.json({
    conversazione,
    messaggi,
    traduzioneAuto: conf.traduzioneAuto === 'si',
    daTradurre: cEDaTradurre,
    linguaCliente,
  })
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
  // I token non si leggono più qui: li risolvono `tokenPerNumero` e
  // `tokenPerPagina`, che partono dall'account che ha ricevuto e ripiegano sulle
  // Impostazioni solo se quello non ne ha uno suo.
  const config = await leggiImpostazioni(['waPhoneNumberId'])

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
    case 'instagram': {
      // ⚠️ Stessa regola di WhatsApp: si risponde DALL'ACCOUNT CHE HA RICEVUTO.
      // La holding ha più Pagine e più profili Instagram; con un token solo, a
      // chi scrive ai fiori risponderebbe la pasticceria. `numeroId` è l'account
      // vero, letto dal webhook di Meta; il token generale delle Impostazioni
      // resta per le conversazioni nate prima che lo registrassimo.
      const nostroAccount = conversazione.numeroId
      const tokenDiQuellAccount = await tokenPerPagina(conversazione.canale, nostroAccount)
      esito = tokenDiQuellAccount
        ? // ⚠️ Il canale viaggia fino in fondo: Instagram con un token IGAA
          // parla solo con `graph.instagram.com`, e senza questo i direct si
          // ricevevano ma non si potevano mandare.
          await inviaPagina(
            tokenDiQuellAccount,
            conversazione.idEsterno,
            pulito,
            nostroAccount,
            conversazione.canale
          )
        : {
            ok: false,
            errore:
              conversazione.canale === 'instagram'
                ? 'Instagram non configurato: nessun token per questo account (pagina Facebook e Instagram).'
                : 'Messenger non configurato: nessun Page Access Token per questa pagina (pagina Facebook e Instagram).',
          }
      break
    }
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
