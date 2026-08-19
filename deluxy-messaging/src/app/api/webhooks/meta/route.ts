import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { linguaDelTesto } from '@/lib/lingua-testo'
import { rispostaDiPrimoContatto } from '@/lib/primo-contatto'

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

  // Accettiamo solo richieste firmate da Meta — ma la firma può venire da DUE
  // segreti diversi.
  //
  // ⚠️ IL PRODOTTO «Instagram API con login di Instagram» HA UNA CHIAVE SEGRETA
  // SUA. Firma i webhook dei DM con quella, non con l'App Secret dell'app
  // Facebook. Verificando con un segreto solo, i messaggi Instagram venivano
  // respinti con 401: da fuori sembrava «Meta non ci manda niente», e si andava
  // a cercare l'iscrizione al webhook — che era a posto.
  //
  // Si provano tutti i segreti configurati e basta che UNO combaci. Non si
  // sceglie in base a `body.object`: quel campo sta nel corpo, e il corpo non è
  // ancora stato verificato — decidere quale chiave usare partendo da un dato
  // non firmato vuol dire lasciare a chi chiama la scelta della serratura.
  const { metaAppSecret, igAppSecret } = await leggiImpostazioni(['metaAppSecret', 'igAppSecret'])
  const segreti = [metaAppSecret, igAppSecret].filter((s): s is string => Boolean(s?.trim()))
  if (segreti.length) {
    const firma = req.headers.get('x-hub-signature-256') || ''
    const inviata = Buffer.from(firma)
    const combacia = segreti.some((segreto) => {
      const attesa = Buffer.from(
        'sha256=' + crypto.createHmac('sha256', segreto).update(grezzo).digest('hex')
      )
      // `timingSafeEqual` pretende la stessa lunghezza: senza il controllo
      // solleva un'eccezione invece di rispondere «firma sbagliata».
      return inviata.length === attesa.length && crypto.timingSafeEqual(inviata, attesa)
    })
    if (!combacia) {
      await annotaChiamata(
        segreti.length > 1
          ? 'firma non valida — non combacia né con l’App Secret né con la chiave segreta di Instagram'
          : 'firma non valida — l’App Secret salvato non è quello di questa app Meta. Se è un evento Instagram, serve la «Chiave segreta di Instagram» (Impostazioni)'
      )
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
          // Foto, video, audio, documenti e sticker: Meta manda l'ID del file,
          // non il file. Con quell'id il file si può poi chiedere e mostrare
          // (vedi /api/media/[id]); senza salvarlo restava la scritta
          // «[image]» e il contenuto era perso.
          image?: { id?: string; mime_type?: string; caption?: string }
          video?: { id?: string; mime_type?: string; caption?: string }
          audio?: { id?: string; mime_type?: string }
          sticker?: { id?: string; mime_type?: string }
          document?: { id?: string; mime_type?: string; caption?: string; filename?: string }
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
      message?: {
        mid?: string
        text?: string
        is_echo?: boolean
        // ⚠️ `payload.url` è l'UNICA copia dell'allegato che Meta ci dà su
        // Instagram e Messenger: qui non c'è nessun id da richiedere dopo, come
        // invece succede su WhatsApp. Buttarlo via — com'era fino al 17/08/2026
        // — vuol dire perdere la foto per sempre e lasciare in chat «[image]».
        attachments?: { type?: string; payload?: { url?: string } }[]
      }
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
  /** L'allegato WhatsApp: l'id del file da Meta, il tipo e il nome originale. */
  media?: { id: string; mimeType: string; nomeFile: string }
  /** L'allegato Instagram/Messenger: l'indirizzo firmato, che lì è tutto ciò che c'è. */
  mediaUrl?: string
  mimeType?: string
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
      eliminataIl: null,
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
      // ⚠️ Riconoscimento IN CODICE: nel webhook non entra nessuna chiamata a
      // OpenAI, o si perdono messaggi. La traduzione vera si fa dopo.
      lingua: linguaDelTesto(opz.testo),
      tipo: opz.tipo ?? 'testo',
      idEsterno: opz.idMessaggio,
      mediaId: opz.media?.id ?? '',
      mediaUrl: opz.mediaUrl ?? '',
      mimeType: opz.media?.mimeType || opz.mimeType || '',
      nomeFile: opz.media?.nomeFile ?? '',
    },
  })

  // ── Il saluto automatico al primo messaggio ──
  //
  // Sta QUI e non in un cron perché il senso è la prontezza: un «ti abbiamo
  // letto» che arriva mezz'ora dopo non risponde alla domanda che si fa chi ha
  // appena scritto. Parte solo al primissimo messaggio di una conversazione
  // (una chiamata a Meta in più su un evento raro) e **non solleva mai**:
  // dentro c'è un try/catch, perché un webhook che fallisce fa perdere il
  // messaggio del cliente — che è la cosa importante, non il saluto.
  await rispostaDiPrimoContatto(conversazione.id)
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
        // L'allegato, se c'è: si tiene l'id del file, non il file.
        const allegato = msg.image ?? msg.video ?? msg.audio ?? msg.sticker ?? msg.document
        const media = allegato?.id
          ? {
              id: allegato.id,
              mimeType: allegato.mime_type ?? '',
              nomeFile: msg.document?.filename ?? '',
            }
          : undefined
        const testo =
          msg.text?.body ||
          msg.button?.text ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          // La DIDASCALIA di una foto è il messaggio: buttarla e scrivere
          // «[image]» vuol dire perdere quello che il cliente ha scritto.
          msg.image?.caption ||
          msg.video?.caption ||
          msg.document?.caption ||
          msg.document?.filename ||
          `[${msg.type ?? 'contenuto'}]`
        await registraInArrivo({
          canale: 'whatsapp',
          idEsterno: msg.from,
          nome: nomi.get(msg.from),
          testo,
          tipo: msg.text?.body ? 'testo' : 'media',
          idMessaggio: msg.id ?? '',
          numeroId,
          numeroNostro,
          media,
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

/** Come si chiama un allegato in italiano, per l'anteprima nell'elenco. */
function nomeAllegato(tipo?: string): string {
  const nomi: Record<string, string> = {
    image: 'Foto',
    video: 'Video',
    audio: 'Messaggio vocale',
    file: 'File',
    share: 'Post condiviso',
    story_mention: 'Menzione in una storia',
    ig_reel: 'Reel',
  }
  return nomi[tipo ?? ''] ?? 'Allegato'
}

/**
 * Il tipo del file, dedotto dal tipo dell'allegato.
 *
 * ⚠️ È un'APPROSSIMAZIONE dichiarata: Meta qui dice «image», non «image/jpeg».
 * Serve solo a far capire al browser che sta ricevendo una foto; il tipo vero
 * lo manda il server di Meta quando si scarica il file, e in `/api/media/[id]`
 * quello ha la precedenza su questo.
 */
function mimeDaTipo(tipo?: string): string {
  if (tipo === 'image') return 'image/jpeg'
  if (tipo === 'video') return 'video/mp4'
  if (tipo === 'audio') return 'audio/mpeg'
  return ''
}

/** Messenger e Instagram condividono la stessa forma di webhook (entry[].messaging[]). */
async function gestisciMessaging(canale: 'messenger' | 'instagram', corpo: MetaWebhook) {
  for (const entry of corpo.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const mittente = ev.sender?.id
      const msg = ev.message
      if (!mittente || !msg || msg.is_echo) continue // is_echo = inviato da noi
      // L'allegato: su questi canali Meta manda un indirizzo già firmato, non
      // un id. Si prende il primo — con più file nello stesso messaggio gli
      // altri restano fuori, ed è un limite noto, non una svista.
      const primo = msg.attachments?.[0]
      const urlAllegato = primo?.payload?.url ?? ''
      // ⚠️ Il testo dell'elenco NON è più «[image]». Nell'inbox si legge
      // l'anteprima dell'ultimo messaggio: «[image]» è gergo del protocollo di
      // Meta e non dice niente a chi lavora. Se il cliente ha scritto qualcosa
      // insieme alla foto, vince il suo testo — è quello che conta.
      const testo = msg.text || (primo ? nomeAllegato(primo.type) : '')
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
        tipo: msg.text && !primo ? 'testo' : primo ? 'media' : 'testo',
        idMessaggio: msg.mid ?? '',
        numeroId: nostroId,
        mediaUrl: urlAllegato,
        mimeType: mimeDaTipo(primo?.type),
      })
    }
  }
}
