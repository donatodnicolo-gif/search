import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, ruoloDaSessione } from "@/lib/auth";

// Metodi che non modificano dati: le letture e la navigazione sono sempre GET/HEAD.
// Le mutazioni dell'app passano da server actions (POST): bloccando i POST si
// blocca ogni scrittura per il profilo di sola lettura, in un punto solo.
const METODI_LETTURA = new Set(["GET", "HEAD", "OPTIONS"]);

export async function middleware(req: NextRequest) {
  // Ritorno OAuth da Fatture in Cloud: la Redirect URL registrata è la root
  // del sito, quindi il codice arriva su "/?code=...&state=fic-..." e va
  // girato al callback che lo scambia coi token.
  if (
    req.nextUrl.pathname === "/" &&
    req.nextUrl.searchParams.get("code") &&
    req.nextUrl.searchParams.get("state")?.startsWith("fic-")
  ) {
    const cb = new URL("/api/fic/callback", req.url);
    cb.search = req.nextUrl.search;
    return NextResponse.redirect(cb);
  }

  const password = process.env.PARTNER_APP_PASSWORD;
  if (!password) {
    // In locale l'app resta aperta: lavorare non deve richiedere di inventarsi
    // una password. In PRODUZIONE no. Qui l'autorizzazione vive quasi tutta in
    // questo file: senza la password non esiste sessione, e "lasciar passare"
    // significherebbe pubblicare in SCRITTURA l'intera contabilità — senza che
    // nulla lo segnali. Un 503 si vede subito; un'app aperta no.
    const inProduzione = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
    if (inProduzione) {
      return new NextResponse(
        "Configurazione incompleta: manca PARTNER_APP_PASSWORD. L'app è chiusa per sicurezza.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const ruolo = await ruoloDaSessione(cookie);
  if (!ruolo) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Sola lettura: consenti solo le richieste di lettura; ogni scrittura (POST,
  // PUT, PATCH, DELETE — incluse le server actions) viene rifiutata.
  if (ruolo === "sola_lettura" && !METODI_LETTURA.has(req.method)) {
    return NextResponse.json(
      { errore: "Accesso di sola lettura: non è consentito modificare i dati." },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export const config = {
  // tutto tranne login, callback OAuth, API pubblica di verifica (auth a chiave),
  // asset statici e file pubblici
  // ⚠️⚠️ `api/fattura` (emissione su Fatture in Cloud) va elencata QUI o la
  // rotta non gira nemmeno: il middleware la rimanda al login con un 307, e
  // chi chiama vede un redirect al posto della risposta. Non basta che
  // `api/fatture` sia gia esclusa — l ancoraggio `(?:/|$)` fa si che
  // `fatture` NON copra `fattura`, ed e voluto (vedi il commento sotto).
  // La chiave si controlla dentro la rotta, come per tutte le altre.
  matcher: [
    // `api/pagamenti/notifica` è il webhook di Deluxy Transactions: si autentica
    // da sé con la firma HMAC. Dentro il middleware riceverebbe un redirect al
    // login, e Transactions leggerebbe HTML credendo che la notifica sia andata
    // a buon fine.
    // `api/health` è il controllo di salute letto dalla pagina Stato servizi
    // del Hub, che non ha una sessione di questa app: risponde solo se il
    // server e il database rispondono, nessun dato contabile.
    // `api/v1` sono le API a chiave dello standard Deluxy (movimenti,
    // ordini-controllo): si autenticano da sé con X-API-Key. Senza questa
    // esclusione il middleware le manda al login e chi legge riceve la PAGINA
    // di login con stato 200, credendo di aver ricevuto dei dati.
    // ⚠️ Ogni voce è ANCORATA a fine segmento con `(?:/|$)`. Senza, i prefissi
    // sono liberi: `api/fatture` escluderebbe dalla sessione anche una futura
    // `/api/fatture-storico`, che nascerebbe pubblica senza che nessuno
    // l'abbia deciso. Oggi non esiste una rotta in quella condizione: si ancora
    // adesso, che non costa niente, per non scoprirlo il giorno in cui
    // qualcuno aggiunge il file.
    "/((?!login(?:/|$)|api/health(?:/|$)|api/sso(?:/|$)|api/fic/callback(?:/|$)|api/shopify/callback(?:/|$)|api/verifiche(?:/|$)|api/fatture(?:/|$)|api/fattura(?:/|$)|api/proforma(?:/|$)|api/tipologie(?:/|$)|api/incassi(?:/|$)|api/tasks(?:/|$)|api/riepilogo-finanziario(?:/|$)|api/clienti(?:/|$)|api/spese(?:/|$)|api/vendor(?:/|$)|api/pagamenti/notifica(?:/|$)|api/cron(?:/|$)|api/v1(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\.ico$).*)",
  ],
};
