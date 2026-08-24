import { NextRequest, NextResponse } from "next/server";
import { authAttiva, configAuthCompleta, inProduzione, leggiSessione, SESSION_COOKIE } from "@/lib/auth";

// Tre compiti:
// 1. /api/health (e /api/v1/*) — pubblici o con auth propria: passano, con CORS.
// 2. Fail-closed in produzione: senza CRM_APP_PASSWORD + CRM_SESSION_SECRET
//    l'app risponde 503 (pattern deluxy-merchandising). Meglio chiusa che coi
//    dati dei clienti pubblici in rete.
// 3. Il resto (UI): serve la sessione (cookie firmato), altrimenti /login.
//    In sviluppo senza segreto la porta è aperta.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/interno/* — endpoint per la UI (ricerca prodotti, spedizioni):
  // stessa sessione a cookie della UI, niente CORS. La chiave del Customer
  // Service resta sul server: il browser non la vede mai.
  if (pathname.startsWith("/api/interno")) {
    if (authAttiva()) {
      const sess = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);
      if (!sess) return NextResponse.json({ errore: "Non autenticato" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
    return res;
  }

  // Fail-closed: in produzione l'app non si apre con la porta smontata.
  if (inProduzione() && !configAuthCompleta()) {
    return new NextResponse(
      "Deluxy CRM non è configurata: mancano CRM_APP_PASSWORD o CRM_SESSION_SECRET. " +
        "L'app resta chiusa finché le variabili non ci sono (fail-closed).",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  if (!authAttiva() || pathname === "/login") return NextResponse.next();

  const sessione = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);
  if (sessione) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
