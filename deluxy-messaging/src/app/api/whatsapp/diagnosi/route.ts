import { NextRequest, NextResponse } from 'next/server'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { db } from '@/lib/db'
import { numeriCollegati, tokenPerNumero } from '@/lib/numeri-whatsapp'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// DIAGNOSI WHATSAPP: perché non arrivano i messaggi.
//
// Nasce da un blocco reale: webhook verificato, credenziali salvate, e in inbox
// zero messaggi. Da fuori non si distingue fra «Meta non ci chiama», «ci chiama
// ma lo respingiamo» e «arriva ma non lo salviamo», e l'unico modo era far
// cliccare l'operatore a caso nella dashboard di Meta.
//
// Qui l'app usa le credenziali che ha già in cassaforte e CHIEDE A META com'è
// messa. Nessun segreto esce dalla risposta: solo esiti.

const API = 'https://graph.facebook.com/v21.0'

type Esito = {
  passo: string
  ok: boolean | null // null = non si è potuto controllare
  dettaglio: string
}

async function chiedi(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; type?: string; code?: number }
  }
  return { ok: res.ok, stato: res.status, corpo }
}

export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  // ⚠️ UN NUMERO PER VOLTA, se lo si chiede.
  //
  // Il controllo completo fa 4-5 chiamate a Meta PER NUMERO: con più numeri
  // collegati la richiesta sfora i 30 secondi della funzione e torna un errore
  // che sembra un guasto della diagnosi — cioè proprio lo strumento che serve a
  // capire cos'è rotto. Con `?numero=<phoneNumberId>` si controlla solo quello:
  // il conto delle chiamate resta fisso, e un numero che non risponde non porta
  // giù anche la diagnosi degli altri.
  const soloQuesto = (req.nextUrl.searchParams.get('numero') ?? '').trim()
  const c = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'waBusinessAccountId',
    'metaVerifyToken',
    'metaAppSecret',
    'igAppSecret',
    'igToken',
    'fbPageToken',
  ])
  const esiti: Esito[] = []

  // 1. Quello che dipende solo da noi.
  esiti.push({
    passo: 'Verify token salvato nell’app',
    ok: Boolean(c.metaVerifyToken?.trim()),
    dettaglio: c.metaVerifyToken?.trim()
      ? 'C’è: l’handshake di Meta può funzionare.'
      : 'Manca: la verifica del webhook su Meta fallirà con 403.',
  })
  esiti.push({
    passo: 'App Secret salvato',
    ok: Boolean(c.metaAppSecret?.trim()),
    dettaglio: c.metaAppSecret?.trim()
      ? 'C’è: accettiamo solo richieste firmate da Meta.'
      : 'Manca: il webhook accetta chiunque conosca l’indirizzo. Da riempire.',
  })
  // ⚠️ «Instagram API con login di Instagram» firma i suoi webhook con una
  // chiave segreta SUA: senza quella la firma non combacia, i DM vengono
  // respinti con 401 e da fuori sembra che Meta non ci chiami affatto.
  esiti.push({
    passo: 'Chiave segreta di Instagram',
    ok: c.igAppSecret?.trim() ? true : null,
    dettaglio: c.igAppSecret?.trim()
      ? 'C’è: accettiamo anche i webhook firmati con la chiave di Instagram.'
      : 'Non impostata. Serve se usi «Instagram API con login di Instagram»: quel prodotto firma i DM con una chiave propria e senza il webhook li respinge con 401 (Impostazioni → Chiave segreta di Instagram).',
  })

  // 2. Ogni numero collegato si controlla da solo: token, numero, iscrizione.
  //    Se non ce n'è nessuno in tabella si ricade sulla vecchia configurazione
  //    singola delle Impostazioni, che è ancora valida per chi ha un numero solo.
  const collegati = await numeriCollegati()
  const scelti = soloQuesto
    ? collegati.filter((n) => n.phoneNumberId === soloQuesto)
    : collegati
  const daControllare = scelti.length
    ? scelti
        .filter((n) => n.attivo || Boolean(soloQuesto))
        .map((n) => ({
          etichetta: n.brand || n.nome || n.phoneNumberId,
          phoneNumberId: n.phoneNumberId,
          wabaId: n.wabaId,
        }))
    : [
        {
          etichetta: 'numero delle Impostazioni',
          phoneNumberId: c.waPhoneNumberId?.trim() ?? '',
          wabaId: c.waBusinessAccountId?.trim() ?? '',
        },
      ]

  if (!daControllare.some((n) => n.phoneNumberId)) {
    esiti.push({
      passo: 'Numeri WhatsApp collegati',
      ok: false,
      dettaglio: 'Nessuno: aggiungine uno in Numeri WhatsApp, o compila le Impostazioni.',
    })
    return NextResponse.json({ esiti, conclusione: 'Nessun numero da controllare.' })
  }

  for (const n of daControllare) {
    if (!n.phoneNumberId) continue
    const token = (await tokenPerNumero(n.phoneNumberId)).trim()
    if (!token) {
      esiti.push({
        passo: `${n.etichetta} — token`,
        ok: false,
        dettaglio: 'Nessun token: né suo né quello generale delle Impostazioni.',
      })
      continue
    }

    const num = await chiedi(
      `${API}/${n.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,status,code_verification_status`,
      token
    )
    esiti.push({
      passo: `${n.etichetta} — il token vede il numero`,
      ok: num.ok,
      dettaglio: num.ok
        ? `${num.corpo.display_phone_number ?? '?'} (${num.corpo.verified_name ?? '?'}), qualità ${num.corpo.quality_rating ?? 'n/d'}.`
        : `Meta risponde ${num.stato}: ${num.corpo.error?.message ?? 'errore sconosciuto'}.`,
    })
    if (!num.ok) continue

    // ⚠️ Un numero può stare sulla CLOUD API o sull'app WhatsApp Business del
    // telefono, **non su tutte e due**. Se è ancora sull'app, i messaggi
    // arrivano sul telefono e il webhook non riceve niente — e tutto il resto
    // dei controlli resta verde, perché il numero esiste e il token lo vede.
    // ⚠️ Un numero può essere sulla Cloud API e non essere ancora CONNESSO: la
    // registrazione (con PIN di verifica in due passaggi) è un passo a parte.
    // Finché non è connesso non riceve niente, e tutto il resto risulta a posto
    // perché il numero esiste e il token lo vede.
    const stato = String(num.corpo.status ?? '')
    esiti.push({
      passo: `${n.etichetta} — il numero è connesso`,
      ok: stato ? stato === 'CONNECTED' : null,
      dettaglio: !stato
        ? 'Meta non dichiara lo stato.'
        : stato === 'CONNECTED'
          ? 'Sì: il numero è registrato e operativo.'
          : `NO, risulta «${stato}» (verifica: ${num.corpo.code_verification_status ?? 'n/d'}): finché non è connesso non riceve messaggi.`,
    })

    const piattaforma = String(num.corpo.platform_type ?? '')
    esiti.push({
      passo: `${n.etichetta} — il numero è sulla Cloud API`,
      ok: piattaforma ? piattaforma === 'CLOUD_API' : null,
      dettaglio: !piattaforma
        ? 'Meta non lo dichiara.'
        : piattaforma === 'CLOUD_API'
          ? 'Sì: i messaggi passano dal webhook.'
          : `NO, risulta «${piattaforma}»: il numero non è sulla Cloud API, quindi i messaggi non passano da qui. Se è ancora collegato all’app WhatsApp Business del telefono va migrato.`,
    })

    // LA DOMANDA CHE CONTA: la nostra app è iscritta a quel WhatsApp Business?
    // Senza questa iscrizione Meta non manda NIENTE per quanto il webhook sia
    // verificato — ed è il caso che dall'app non si vede in nessun modo.
    if (!n.wabaId) {
      esiti.push({
        passo: `${n.etichetta} — app iscritta al WhatsApp Business`,
        ok: null,
        dettaglio:
          'Non controllabile: manca il WhatsApp Business Account ID di questo numero (il numero lungo sotto il nome in WhatsApp Manager).',
      })
      continue
    }
    const iscr = await chiedi(`${API}/${n.wabaId}/subscribed_apps`, token)
    const app = (iscr.corpo.data as { whatsapp_business_api_data?: { name?: string } }[]) ?? []
    esiti.push({
      passo: `${n.etichetta} — app iscritta al WhatsApp Business`,
      ok: iscr.ok ? app.length > 0 : false,
      dettaglio: !iscr.ok
        ? `Meta risponde ${iscr.stato}: ${iscr.corpo.error?.message ?? 'errore'}.`
        : app.length
          ? `Iscritte: ${app.map((a) => a.whatsapp_business_api_data?.name ?? '?').join(', ')}.`
          : 'NESSUNA app iscritta: ecco perché non arriva niente. Va iscritta l’app su Meta → WhatsApp → Configurazione.',
    })
  }

  // 3. L'ALTRO PEZZO, SEPARATO E FACILE DA DIMENTICARE: l'iscrizione al campo
  //    `messages`.
  //
  //    Sono due cose diverse e vanno fatte tutte e due: l'app iscritta al WABA
  //    (sopra) e l'app iscritta al CAMPO `messages` del webhook. Con la prima
  //    fatta e la seconda no, Meta non manda i messaggi e ogni controllo
  //    risulta verde — che è esattamente il vicolo cieco in cui si finisce.
  //    Qui si legge dall'app Meta: quali oggetti/campi sono iscritti e a quale
  //    URL, così si vede anche se l'indirizzo registrato è davvero il nostro.
  const tokenQualsiasi = (await tokenPerNumero(daControllare[0]?.phoneNumberId ?? '')).trim()
  const segreto = c.metaAppSecret?.trim()
  if (tokenQualsiasi && segreto) {
    const app = await chiedi(`${API}/app?fields=id,name`, tokenQualsiasi)
    const appId = typeof app.corpo.id === 'string' ? app.corpo.id : ''
    if (!appId) {
      esiti.push({
        passo: 'Iscrizione al campo «messages»',
        ok: null,
        dettaglio: `Non controllabile: Meta non dice a quale app appartiene il token (${app.corpo.error?.message ?? 'risposta inattesa'}).`,
      })
    } else {
      // Il token dell'APP è "id|segreto": serve per leggere le iscrizioni.
      const sub = await chiedi(
        `${API}/${appId}/subscriptions?access_token=${appId}|${segreto}`,
        tokenQualsiasi
      )
      const righe = (sub.corpo.data as
        | { object?: string; callback_url?: string; fields?: { name?: string }[] }[]
        | undefined) ?? []
      const wa = righe.find((r) => r.object === 'whatsapp_business_account')
      const campi = (wa?.fields ?? []).map((f) => f.name).filter(Boolean) as string[]
      esiti.push({
        passo: 'Iscrizione al campo «messages»',
        ok: !sub.ok ? false : campi.includes('messages'),
        dettaglio: !sub.ok
          ? `Meta risponde ${sub.stato}: ${sub.corpo.error?.message ?? 'errore'}. (App Secret sbagliato?)`
          : !wa
            ? 'L’app non ha nessun webhook per WhatsApp: va aggiunto l’URL e iscritto il campo messages.'
            : campi.includes('messages')
              ? `Iscritta a: ${campi.join(', ')}. URL registrato: ${wa.callback_url ?? '?'}`
              : `MANCA «messages» — iscritta solo a: ${campi.join(', ') || 'niente'}. È per questo che non arriva nulla.`,
      })
      if (wa?.callback_url) {
        const nostro = 'https://deluxy-messaging.vercel.app/api/webhooks/meta'
        esiti.push({
          passo: 'URL del webhook registrato su Meta',
          ok: wa.callback_url === nostro,
          dettaglio:
            wa.callback_url === nostro
              ? 'È il nostro.'
              : `Punta altrove: ${wa.callback_url} — i messaggi vanno lì, non a noi.`,
        })
      }

      // ── Instagram e Messenger ──
      //
      // Stesso webhook, OGGETTI DIVERSI: `instagram` e `page` si iscrivono a
      // parte. Averli configurati per WhatsApp non li abilita, e senza
      // iscrizione non arriva niente esattamente come è successo con WhatsApp —
      // con la differenza che lì almeno ce ne siamo accorti.
      for (const [oggetto, nome] of [
        ['instagram', 'Instagram'],
        ['page', 'Messenger'],
      ] as const) {
        // Il token può stare in due posti: sul singolo account collegato
        // (/account-meta, il modo giusto quando i marchi sono più d'uno) o nelle
        // Impostazioni come ripiego. Guardare solo il secondo diceva «manca» a
        // chi aveva configurato tutto bene.
        const canale = oggetto === 'instagram' ? 'instagram' : 'messenger'
        const conToken = await db.paginaMeta.count({
          where: { canale, attivo: true, NOT: { token: '' } },
        })
        const tokenGenerale = oggetto === 'instagram' ? c.igToken?.trim() : c.fbPageToken?.trim()
        const tokenCanale = conToken > 0 || Boolean(tokenGenerale)
        const riga = righe.find((r) => r.object === oggetto)
        const suoiCampi = (riga?.fields ?? []).map((f) => f.name).filter(Boolean) as string[]
        esiti.push({
          passo: `${nome} — token salvato`,
          ok: tokenCanale,
          dettaglio: conToken
            ? `${conToken} account con token proprio (Facebook e Instagram).`
            : tokenGenerale
              ? 'C’è quello generale delle Impostazioni: basta con UN account solo.'
              : `Manca: senza, i messaggi ${nome} si possono ricevere ma non si può rispondere (pagina Facebook e Instagram).`,
        })
        esiti.push({
          passo: `${nome} — iscrizione al webhook`,
          ok: suoiCampi.includes('messages'),
          dettaglio: !riga
            ? `L’app non è iscritta all’oggetto «${oggetto}»: va aggiunto su Meta → Webhooks, con lo stesso URL, e spuntato il campo messages.`
            : suoiCampi.includes('messages')
              ? `Iscritta a: ${suoiCampi.join(', ')}.`
              : `MANCA «messages» — iscritta solo a: ${suoiCampi.join(', ') || 'niente'}.`,
        })
      }
    }
  }

  // 4. Cosa è arrivato davvero da noi.
  //
  // ⚠️ SOLO WhatsApp. In inbox ci sono anche le email — 107 al momento — e
  // contarle tutte insieme faceva sembrare che l'inbox funzionasse mentre
  // WhatsApp era fermo a zero. Un numero giusto sulla domanda sbagliata inganna
  // più del numero mancante.
  const [conv, msg] = await Promise.all([
    db.conversazione.count({ where: { canale: 'whatsapp' } }),
    db.messaggio.count({ where: { conversazione: { canale: 'whatsapp' } } }),
  ])
  // ⚠️ LA RIGA CHE TAGLIA LA TESTA AL TORO: Meta ci ha mai chiamati?
  //
  // Con tutti i controlli verdi e l'inbox vuota restano due spiegazioni opposte
  // — Meta non chiama, oppure chiama e noi respingiamo — e si risolvono in
  // posti diversi. Il webhook ora lascia traccia di ogni chiamata, respinte
  // comprese, e qui la si legge.
  const traccia = await leggiImpostazioni(['webhookUltimaChiamata', 'webhookUltimoEsito'])
  const quando = traccia.webhookUltimaChiamata?.trim()
  esiti.push({
    passo: 'Meta ci ha chiamati?',
    ok: Boolean(quando),
    dettaglio: quando
      ? `Ultima chiamata: ${new Date(quando).toLocaleString('it-IT')} — esito: ${traccia.webhookUltimoEsito || 'non registrato'}.`
      : 'MAI. Nessuna chiamata è mai arrivata al nostro webhook: il problema è tutto dal lato Meta, non nostro.',
  })

  esiti.push({
    passo: 'Messaggi WhatsApp ricevuti finora',
    ok: msg > 0,
    dettaglio:
      msg > 0
        ? `${msg} messaggi in ${conv} conversazioni WhatsApp.`
        : 'Nessuno: se i passi qui sopra sono tutti verdi, manda un messaggio di prova al numero.',
  })

  const rotti = esiti.filter((e) => e.ok === false)
  return NextResponse.json({
    esiti,
    conclusione: rotti.length
      ? `Da sistemare: ${rotti.map((r) => r.passo).join('; ')}.`
      : 'Tutto a posto da questa parte: se non arriva nulla, manda un messaggio di prova.',
  })
}
