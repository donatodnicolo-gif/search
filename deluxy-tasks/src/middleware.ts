import { NextRequest, NextResponse } from "next/server";
import { leggiSessione, SESSION_COOKIE } from "@/lib/auth";

// Due compiti:
// 1. /api/* — CORS: permette alle app Deluxy nel browser di leggere/scrivere le
//    task. Le chiamate restano protette dalla chiave x-api-key.
// 2. tutto il resto (UI) — accesso per-utente con le credenziali del Hub: la
//    sessione è un cookie firmato che porta email/nome/ruolo (vedi lib/auth.ts).
//    Se TASKS_SESSION_SECRET non è impostata (sviluppo locale) l'accesso è aperto
//    e la UI tratta l'utente come admin (vede tutte le task).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authAttiva = Boolean(process.env.TASKS_SESSION_SECRET);

  // /api/interno/* — endpoint per la UI (azioni: completa/archivia/scegli livello):
  // stessa sessione a cookie della UI, niente CORS, niente chiavi API.
  if (pathname.startsWith("/api/interno")) {
    if (authAttiva) {
      const sess = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);
      if (!sess) return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
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

  if (!authAttiva || pathname === "/login") return NextResponse.next();

  const sess = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);
  if (sess) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
