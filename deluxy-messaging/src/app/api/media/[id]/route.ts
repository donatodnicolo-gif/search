import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { urlMediaWhatsApp } from '@/lib/meta'
import { tokenPerNumero } from '@/lib/numeri-whatsapp'
import { utenteCorrente } from '@/lib/sessione'

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
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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
    // ⚠️ Anche qui il tipo passa dal filtro: il server di Meta lo riporta dal
    // file caricato, non lo decide lui.
    return new NextResponse(file.body, {
      headers: intestazioniFile(
        file.headers.get('content-type') || messaggio.mimeType || '',
        messaggio.nomeFile
      ),
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

  return new NextResponse(file.body, {
    headers: intestazioniFile(messaggio.mimeType || indirizzo.mimeType || '', messaggio.nomeFile),
  })
}

/**
 * I TIPI CHE SI POSSONO APRIRE DENTRO L'APP.
 *
 * ⚠️⚠️ Nasce da un buco vero, trovato il 27/08/2026. Il `Content-Type` con cui
 * questa rotta serviva il file era **quello dichiarato da chi ha mandato il
 * messaggio**: `mime_type` arriva nel payload di Meta dal documento caricato
 * dal mittente (`webhooks/meta/route.ts`, ramo `document`) e finiva dritto
 * nell'intestazione, con `Content-Disposition: inline`. Uno sconosciuto manda
 * al numero del servizio clienti un «fattura.html» con dentro uno `<script>`,
 * l'operatore in inbox ci clicca — è il suo mestiere — e quel codice gira
 * **sull'origine dell'app**, con la sua sessione: legge l'inbox, la rubrica dei
 * clienti, i pagamenti. Un `image/svg+xml` fa lo stesso, perché aperto come
 * documento di primo livello gli script dentro un SVG vengono eseguiti.
 *
 * ⚠️⚠️ E `X-Content-Type-Options: nosniff` **DA SOLO NON BASTA**, che è la
 * correzione che verrebbe naturale: `nosniff` impedisce al browser di
 * *indovinare* un tipo, non gli impedisce di rispettare un `text/html`
 * *dichiarato*. Chi si ferma lì crede di aver chiuso e non ha chiuso niente.
 * Serve la lista bianca: quello che non è in elenco esce come
 * `application/octet-stream` e in `attachment`, cioè si scarica e non si apre.
 *
 * ⚠️ La lista è la stessa idea di `TIPI_RICEVUTA` in
 * `api/pagamenti/[id]/ricevuta/route.ts`, dove la regola era già scritta e
 * applicata: qui non era arrivata.
 *
 * ⚠️ Misurato prima di stringere, sui 3.779 messaggi in tabella: 126
 * `image/jpeg`, 6 `image/png`, 3 `image/webp`, 3 `audio/ogg`, 1
 * `application/pdf` — e **nessun** `text/html` né `image/svg+xml`. La lista
 * bianca non toglie niente di quello che i clienti mandano davvero.
 */
const APRIBILI = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'video/mp4',
])

function intestazioniFile(dichiarato: string, nomeFile: string): Record<string, string> {
  // ⚠️ Solo la parte prima del «;»: Meta manda «audio/ogg; codecs=opus», e
  // confrontarlo intero farebbe cadere nella lista nera un audio legittimo.
  const tipo = (dichiarato || '').split(';')[0].trim().toLowerCase()
  const ok = APRIBILI.has(tipo)
  const nome = nomeFile ? encodeURIComponent(nomeFile) : 'allegato'
  return {
    'Content-Type': ok ? tipo : 'application/octet-stream',
    // ⚠️ `nosniff` c'è comunque: non basta da solo, ma senza di lui un
    // `application/octet-stream` che *sembra* HTML potrebbe essere indovinato.
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${ok ? 'inline' : 'attachment'}; filename="${nome}"`,
    // I file non cambiano mai: si possono tenere nel browser. `private`
    // perché sono messaggi di clienti, non roba da CDN condivise.
    'Cache-Control': 'private, max-age=3600',
  }
}
