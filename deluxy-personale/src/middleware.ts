import { NextRequest, NextResponse } from "next/server";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";

// Tre porte, tre regole:
// 1. /api/health — pubblica (la legge la pagina Stato del Hub): MAI dietro il
//    login, altrimenti il Hub riceve la pagina HTML al posto del JSON.
// 2. /api/v1/* — CORS aperto, autenticazione con chiave x-api-key dentro le
//    rotte (le API si autenticano da sé, non col cookie).
// 3. tutto il resto (UI) — cookie di sessione. FAIL-CLOSED: in produzione,
//    senza password o segreto l'app risponde 503 e non apre niente (i dati
//    del personale non finiscono pubblici per una variabile dimenticata).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/health") return NextResponse.next();

  // L'ingresso SSO dal Hub deve restare raggiungibile da fuori sessione.
  if (pathname === "/api/sso") return NextResponse.next();

  if (pathname.startsWith("/api/v1")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const configurata = Boolean(process.env.PERSONALE_SESSION_SECRET && process.env.PERSONALE_APP_PASSWORD);
  if (!configurata) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Deluxy Personale non è configurata: mancano PERSONALE_APP_PASSWORD o PERSONALE_SESSION_SECRET. Accesso chiuso.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return NextResponse.next(); // sviluppo locale senza segreti: UI aperta
  }

  if (pathname === "/login") return NextResponse.next();

  const sessione = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);
  if (sessione) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
