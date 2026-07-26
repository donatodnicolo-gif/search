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
  if (!password) return NextResponse.next(); // sviluppo locale: aperta

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
  matcher: [
    "/((?!login|api/sso|api/fic/callback|api/shopify|api/verifiche|api/fatture|api/proforma|api/tipologie|api/incassi|api/tasks|api/riepilogo-finanziario|api/clienti|api/spese|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
