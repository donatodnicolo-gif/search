import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'

export const dynamic = 'force-dynamic'

// Webhook unico per tutti i prodotti Meta: WhatsApp Cloud API (object
// "whatsapp_business_account"), Messenger ("page") e Instagram ("instagram").
// Su developers.facebook.com si punta questo URL per tutti e tre.

// Verifica dell'iscrizione: Meta chiama GET con il verify token scelto da noi.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const { metaVerifyToken } = await leggiImpostazioni(['metaVerifyToken'])
  if (
    p.get('hub.mode') === 'subscribe' &&
    metaVerifyToken &&
    p.get('hub.verify_token') === metaVerifyToken
  ) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new NextResponse('Verify token errato', { status: 403 })
}

/**
 * Lascia traccia di OGNI chiamata di Meta, anche di quelle respinte.
 *
 * ⚠️ Senza questo, un webhook che non funziona è muto: la diagnosi risulta
 * tutta verde (token valido, app iscritta, campo messages spuntato, URL giusto)
 * e in inbox non arriva niente, senza modo di distinguere «Meta non ci ha mai
 * chiamati» da «ci chiama e lo respingiamo per firma non valida». Sono due
 * problemi opposti e si risolvono in posti diversi.
 *
 * Non si usa un file di log: quelli di Vercel durano pochi minuti e la prova
 * arriva sempre dopo. Due righe in tabella bastano.
 */
async function annotaChiamata(esito: string) {
  try {
    await db.impostazione.upsert({
      where: { chiave: 'webhookUltimaChiamata' },
      update: { valore: new Date().toISOString() },
      create: { chiave: 'webhookUltimaChiamata', valore: new Date().toISOString() },
    })
    await db.impostazione.upsert({
      where: { chiave: 'webhookUltimoEsito' },
      update: { valore: esito },
      create: { chiave: 'webhookUltimoEsito', valore: esito },
    })
  } catch {
    // La traccia non deve MAI far fallire la ricezione di un messaggio.
  }
}

export async function POST(req: NextRequest) {
  const grezzo = await req.text()

  // Se l'App Secret è configurato, accettiamo solo richieste firmate da Meta.
  const { metaAppSecret } = await leggiImpostazioni(['metaAppSecret'])
  if (metaAppSecret) {
    const firma = req.headers.get('x-hub-signature-256') || ''
    const attesa =
      'sha256=' + crypto.createHmac('sha256', metaAppSecret).update(grezzo).digest('hex')
    const a = Buffer.from(firma)
    const b = Buffer.from(attesa)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await annotaChiamata('firma non valida — l’App Secret salvato non è quello di questa app Meta')
      return new NextResponse('Firma non valida', { status: 401 })
    }
  }

  let corpo: MetaWebhook
  try {
    corpo = JSON.parse(grezzo)
  } catch {
    await annotaChiamata('JSON non valido')
    return new NextResponse('JSON non valido', { status: 400 })
  }

  // Rispondiamo comunque 200: se un pezzo fallisce Meta non deve ritentare
  // all'infinito, e l'errore lo vediamo nei log.
  try {
    if (corpo.object === 'whatsapp_business_account') await gestisciWhatsApp(corpo)
    else if (corpo.object === 'page') await gestisciMessaging('messenger', corpo)
    else if (corpo.object === 'instagram') await gestisciMessaging('instagram', corpo)
    await annotaChiamata(`ricevuto: ${corpo.object ?? 'oggetto sconosciuto'}`)
  } catch (e) {
    console.error('Webhook Meta: errore in elaborazione', e)
    await annotaChiamata(`errore in elaborazione: ${(e as Error).message}`)
  }
  return NextResponse.json({ ok: true })
}

type MetaWebhook = {
  object?: string
  entry?: {
    changes?: {
      value?: {
        // ⚠️ Meta dice SEMPRE su quale nostro numero è arrivato il messaggio,
        // e finora lo buttavamo via. Con più WhatsApp Business (Flowers, Cake,
        // Deluxy…) è l'unico modo per sapere a quale marchio ha scritto il
        // cliente — e quindi con che tono e che firma rispondergli.
        metadata?: { phone_number_id?: string; display_phone_number?: string }
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
        messages?: {
          id?: string
          from?: string
          type?: string
          text?: { body?: string }
          button?: { text?: string }
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
        }[]
        statuses?: { id?: string; status?: string; errors?: { message?: string }[] }[]
      }
    }[]
    // Su Messenger e Instagram `entry.id` è il NOSTRO account (Pagina o profilo
    // professionale). Serve come ripiego quando `recipient` non c'è.
    id?: string
    messaging?: {
      sender?: { id?: string }
      // ⚠️ A QUALE nostro account ha scritto il cliente. Con più pagine e più
      // profili Instagram è l'unico modo per sapere a quale marchio si sta
      // rispondendo — e da quale token far uscire la risposta.
      recipient?: { id?: string }
      message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] }
    }[]
  }[]
}

/** Registra un messaggio in arrivo nella conversazione giusta (creandola se serve). */
async function registraInArrivo(opz: {
  canale: string
  idEsterno: string
  nome?: string
  testo: string
  tipo?: string
  idMessaggio: string
  /**
   * Il NOSTRO capo della conversazione: `phone_number_id` su WhatsApp, id della
   * Pagina o dell'account Instagram sugli altri canali Meta. Stesso campo
   * perché fa lo stesso mestiere.
   */
  numeroId?: string
  /** Lo stesso, in forma leggibile, per mostrarlo in inbox (solo WhatsApp). */
  numeroNostro?: string
}) {
  // Dedup: Meta può consegnare lo stesso evento più volte.
  if (opz.idMessaggio) {
    const esiste = await db.messaggio.findFirst({ where: { idEsterno: opz.idMessaggio } })
    if (esiste) return
  }

  const numeroId = opz.numeroId ?? ''
  const conversazione = await db.conversazione.upsert({
    where: {
      canale_idEsterno_numeroId: { canale: opz.canale, idEsterno: opz.idEsterno, numeroId },
    },
    update: {
      ultimoTesto: opz.testo,
      ultimoMessaggioIl: new Date(),
      nonLetti: { increment: 1 },
      archiviata: false,
      ...(opz.nome ? { nome: opz.nome } : {}),
      // Il numero leggibile può arrivare dopo: si scrive quando c'è, senza
      // cancellare quello già noto.
      ...(opz.numeroNostro ? { numeroNostro: opz.numeroNostro } : {}),
    },
    create: {
      canale: opz.canale,
      idEsterno: opz.idEsterno,
      numeroId,
      numeroNostro: opz.numeroNostro ?? '',
      nome: opz.nome ?? '',
      ultimoTesto: opz.testo,
      nonLetti: 1,
    },
  })

  await db.messaggio.create({
    data: {
      conversazioneId: conversazione.id,
      direzione: 'in',
      testo: opz.testo,
      tipo: opz.tipo ?? 'testo',
      idEsterno: opz.idMessaggio,
    },
  })
}

async function gestisciWhatsApp(corpo: MetaWebhook) {
  for (const entry of corpo.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const valore = change.value
      if (!valore) continue

      // Su quale nostro numero è arrivato: sta nel metadata di ogni change.
      const numeroId = valore.metadata?.phone_number_id ?? ''
      const numeroNostro = valore.metadata?.display_phone_number ?? ''

      const nomi = new Map<string, string>()
      for (const c of valore.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nomi.set(c.wa_id, c.profile.name)
      }

      for (const msg of valore.messages ?? []) {
        if (!msg.from) continue
        const testo =
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          `[${msg.type ?? 'contenuto'}]` // media, audio, sticker…: v1 mostra il tipo
        await registraInArrivo({
          canale: 'whatsapp',
          idEsterno: msg.from,
          nome: nomi.get(msg.from),
          testo,
          tipo: msg.text?.body ? 'testo' : 'media',
          idMessaggio: msg.id ?? '',
          numeroId,
          numeroNostro,
        })
      }

      // Aggiornamenti di stato dei messaggi che abbiamo inviato noi.
      for (const st of valore.statuses ?? []) {
        if (!st.id || !st.status) continue
        const stato =
          st.status === 'sent'
            ? 'inviato'
            : st.status === 'delivered'
              ? 'consegnato'
              : st.status === 'read'
                ? 'letto'
                : st.status === 'failed'
                  ? 'errore'
                  : ''
        if (!stato) continue
        await db.messaggio.updateMany({
          where: { idEsterno: st.id, direzione: 'out' },
          data: { stato, errore: st.errors?.[0]?.message ?? '' },
        })
      }
    }
  }
}

/** Messenger e Instagram condividono la stessa forma di webhook (entry[].messaging[]). */
async function gestisciMessaging(canale: 'messenger' | 'instagram', corpo: MetaWebhook) {
  for (const entry of corpo.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const mittente = ev.sender?.id
      const msg = ev.message
      if (!mittente || !msg || msg.is_echo) continue // is_echo = inviato da noi
      const testo =
        msg.text || (msg.attachments?.length ? `[${msg.attachments[0]?.type ?? 'allegato'}]` : '')
      if (!testo) continue
      // Il NOSTRO account che ha ricevuto: `recipient.id` quando c'è, altrimenti
      // `entry.id`. Va nello stesso campo del numero WhatsApp perché fa lo
      // stesso mestiere — tenere separate le conversazioni di marchi diversi e
      // far uscire la risposta dall'account giusto.
      const nostroId = ev.recipient?.id || entry.id || ''
      await registraInArrivo({
        canale,
        idEsterno: mittente,
        testo,
        tipo: msg.text ? 'testo' : 'media',
        idMessaggio: msg.mid ?? '',
        numeroId: nostroId,
      })
    }
  }
}
