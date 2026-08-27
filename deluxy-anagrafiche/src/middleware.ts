import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessioneValida } from "@/lib/auth";

// Due compiti:
// 1. /api/* — CORS per le API di lettura: permette alle app Deluxy nel browser
//    (es. l'app search/supplier su search-deluxy.vercel.app) di interrogare il
//    registro. Le chiamate restano protette dalla chiave x-api-key; via CORS si
//    espongono solo GET (le scritture arrivano server-to-server dalla piattaforma).
// 2. tutto il resto (UI) — protezione con password unica come deluxy-partner.
//
// ⚠️⚠️ IL GUASTO VA NELLA DIREZIONE SICURA (27/08/2026). Prima, se
// ANAGRAFICHE_APP_PASSWORD non era impostata, la UI **e** /api/interno erano
// aperte a chiunque: senza errore, senza log, senza segnale. Un rename della
// variabile, un progetto Vercel ricreato o un deploy da un altro ambiente
// aprivano il registro intero — /chiavi compresa, dove si conia una chiave di
// scrittura piena. Ora la password manca solo in sviluppo locale
// (NODE_ENV !== "production"); in produzione la sua assenza CHIUDE tutto.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

// L'apertura senza password è ammessa solo fuori produzione.
const aperturaVietata = () => process.env.NODE_ENV === "production";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/interno/* — endpoint per la UI (ricerche del popup di riconciliazione):
  // stessa sessione a cookie della UI, niente CORS, niente chiavi API.
  if (pathname.startsWith("/api/interno")) {
    const password = process.env.ANAGRAFICHE_APP_PASSWORD;
    if (!password) {
      // In produzione senza password non si passa: chiuso, non aperto.
      if (aperturaVietata()) {
        return NextResponse.json({ errore: "Configurazione mancante" }, { status: 503 });
      }
      return NextResponse.next();
    }
    const cookie = req.cookies.get(SESSION_COOKIE)?.value;
    if (!cookie || !(await sessioneValida(cookie, password))) {
      return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const password = process.env.ANAGRAFICHE_APP_PASSWORD;
  if (!password) {
    if (aperturaVietata()) {
      return new NextResponse(
        "Configurazione mancante: ANAGRAFICHE_APP_PASSWORD non è impostata.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }
  if (pathname === "/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && (await sessioneValida(cookie, password))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // API (per il CORS) e tutta la UI tranne gli asset statici
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
