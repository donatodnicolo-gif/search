import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verificaSessione } from '@/lib/auth'

// CORS per le API a chiave (`/api/v1/*`): le altre app Deluxy possono leggerle
// anche dal browser. Restano protette dalla chiave `x-api-key`.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

export async function middleware(req: NextRequest) {
  // Le API a chiave si autenticano da sé (standard Deluxy §4.3): il cancello
  // della sessione le rimanderebbe al login, che per un'app che chiama da
  // server non vuol dire niente.
  if (req.nextUrl.pathname.startsWith('/api/v1')) {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
    }
    const res = NextResponse.next()
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v)
    return res
  }

  // Il cancello è la sessione firmata: solo chi ha fatto login con un utente
  // valido ha un cookie che supera la verifica della firma.
  // ⚠️ Qui si verifica solo la FIRMA: il middleware gira su edge e il database
  // non lo può leggere. Che la sessione valga ANCORA (utente cancellato,
  // password cambiata) lo dice , che il database lo legge —
  // ed è per questo che ogni rotta lo richiama invece di fidarsi di qui.
  const sessione = await verificaSessione(req.cookies.get(SESSION_COOKIE)?.value)
  if (sessione) return NextResponse.next()

  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  // Tutto tranne: il login, la pagina e le API del widget (pubbliche: sono la
  // chat dei visitatori dei siti, autenticata dal token di sessione del widget),
  // i webhook Meta (autenticati dal verify token e dalla firma X-Hub-Signature),
  // i cron di Vercel (autenticati dal Bearer CRON_SECRET: non hanno un cookie di
  // sessione, di qui verrebbero rimandati al login), il health-check e gli asset.
  //
  // ⚠️ `api/health` va escluso o il controllo NON FUNZIONA: il Hub lo chiama da
  // server, senza cookie di sessione, e il middleware gli risponderebbe con un
  // redirect al login. La pagina di stato mostrerebbe l'app come irraggiungibile
  // mentre sta benissimo — un falso allarme peggiore del non controllare, perché
  // insegna a ignorare i rossi.
  // Restare pubblico è accettabile perché la risposta non contiene dati: solo
  // «risponde», «il database scrive», e due conteggi.
  //
  // ⚠️ `chat` è la pagina pubblica del link `/chat/<codice>`: se passasse di qui
  // finirebbe al login, cioè il link mandato ai clienti non funzionerebbe per
  // nessuno tranne noi. È pubblica di proposito, e il suo cancello è il codice
  // casuale nell'indirizzo, non la sessione.
  // ⚠️⚠️ OGNI ECCEZIONE È ANCORATA a una barra o alla fine del percorso. Prima
  // le alternative erano nude, quindi l'eccezione valeva per PREFISSO: bastava
  // che un percorso COMINCIASSE con «chat» o «widget» per restare fuori dal
  // cancello. Oggi non espone niente — l'ho verificato voce per voce su tutte
  // le rotte esistenti: `/chargeback` e `/chiamate` non cominciano per «chat»,
  // e `/aspetto-widget` comincia per «a» — ma è il tipo di difetto che non si
  // trova mai guardando il file che l'ha causato: il giorno che qualcuno
  // aggiunge `/chat-interna`, `/widget-statistiche` o `/api/cronologia`, quella
  // rotta nasce **pubblica** e nessun controllo lo dice.
  //
  // ⚠️⚠️ `widget.js` VA ELENCATO A PARTE, e ci sono cascato: ancorando le
  // eccezioni, `/widget.js` ha smesso di combaciare con `widget` (che prima
  // funzionava per PREFISSO) ed è finito dietro al cancello — cioè lo script
  // che i tre siti dei clienti caricano col tag `<script src=".../widget.js">`
  // rispondeva **307 verso /login**, e la chat spariva da tutti e tre. È il
  // rovescio esatto del difetto che l'ancoraggio doveva chiudere, ed è passato
  // perché avevo provato `/loginX` e `/chat-interna` ma non i file statici.
  //
  // ⚠️ Chi mette un file nuovo in `public/` deve aggiungerlo qui: oggi ce n'è
  // uno solo (`widget.js`), e un file statico che nasce dietro al login non dà
  // nessun errore — semplicemente non si carica dove serve.
  // ⚠️ `api/pagamenti/notifica` è il webhook degli esiti di Deluxy
  // Transactions (28/08/2026): si autentica con la firma HMAC dentro la
  // rotta, come i webhook Meta. Senza l'esclusione, Transactions riceverebbe
  // l'HTML del login con 200 e crederebbe la notifica consegnata (stessa
  // lezione di deluxy-partner). Ancorato: vale solo per quel percorso esatto,
  // il resto di /api/pagamenti resta dietro la sessione.
  matcher: [
    '/((?!(?:login|registrati|widget|widget\\.js|chat|api/widget|api/webhooks|api/cron|api/health|api/pagamenti/notifica|_next/static|_next/image|favicon\\.ico)(?:/|$)).*)',
  ],
}
