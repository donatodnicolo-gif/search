import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSIONE, idDaCookie } from "@/lib/cookie-firma";

// Tre compiti, in quest'ordine:
//
// 1. /api/v1/* — NIENTE CORS. Le API di questa app si chiamano da server a
//    server, con una chiave e una firma: se rispondessero anche al browser,
//    basterebbe una pagina qualsiasi per provare a usarle. Le altre app Deluxy
//    espongono CORS aperto perché servono dati di lettura; qui si creano
//    pagamenti, quindi la deviazione dallo Standard §4.3 è voluta.
//
// 2. Header di sicurezza su tutto: CSP stretta (niente script esterni, niente
//    inline eval), niente iframe, niente referrer, niente sniffing del tipo.
//
// 3. UI — chi non ha un cookie di sessione firmato va al login. Il controllo
//    vero (sessione viva sul database, operatore attivo) lo rifà ogni pagina:
//    qui si scartano solo i cookie palesemente falsi, perché il middleware gira
//    su Edge e non può interrogare il database.

const PUBBLICHE = ["/login"];

const SVILUPPO = process.env.NODE_ENV !== "production";

// In produzione gli script sono ammessi solo con il nonce di quella risposta:
// uno script iniettato in una pagina (XSS) non ha il nonce e non parte.
// Next legge il nonce dall'header CSP della richiesta e lo mette sui propri tag.
// In sviluppo servono 'unsafe-eval' e 'unsafe-inline' perché il dev server di
// webpack costruisce i moduli con eval(): senza, la pagina non si idrata.
function csp(nonce: string): string {
  return [
    "default-src 'self'",
    SVILUPPO ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

const SICUREZZA: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  // same-origin e non no-referrer: verso l'esterno non esce nulla lo stesso, ma
  // dentro l'app il browser continua a mandare Origin/Referer. Con no-referrer
  // Chrome manda «Origin: null» sulle server action e Next le rifiuta.
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

function nonceCasuale(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

function conHeader(res: NextResponse, nonce: string): NextResponse {
  for (const [k, v] of Object.entries(SICUREZZA)) res.headers.set(k, v);
  res.headers.set("Content-Security-Policy", csp(nonce));
  return res;
}

/** NextResponse.next() che porta il nonce anche alla richiesta, per Next. */
function prosegui(req: NextRequest, nonce: string): NextResponse {
  const intestazioni = new Headers(req.headers);
  intestazioni.set("Content-Security-Policy", csp(nonce));
  return NextResponse.next({ request: { headers: intestazioni } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = nonceCasuale();

  if (pathname.startsWith("/api")) {
    // Nessun preflight consentito: un browser non deve poter chiamare queste API.
    if (req.method === "OPTIONS") return new NextResponse(null, { status: 405 });
    return conHeader(NextResponse.next(), nonce);
  }

  // In produzione senza APP_SECRET i cookie sarebbero firmati con un valore
  // noto: meglio un'app che non entra di una che entra chiunque.
  if (process.env.NODE_ENV === "production" && !(process.env.APP_SECRET ?? "").trim()) {
    return conHeader(
      new NextResponse("Configurazione incompleta: manca APP_SECRET.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
      nonce,
    );
  }

  if (PUBBLICHE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return conHeader(prosegui(req, nonce), nonce);
  }

  const id = await idDaCookie(req.cookies.get(COOKIE_SESSIONE)?.value);
  if (!id) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("da", pathname);
    return conHeader(NextResponse.redirect(url), nonce);
  }

  return conHeader(prosegui(req, nonce), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
