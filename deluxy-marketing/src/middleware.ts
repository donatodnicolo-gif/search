import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Chi entra da browser deve conoscere la password dell'app; chi entra dalle
// API (script di Google Ads, sessioni Claude) porta la propria chiave e non
// passa di qui. Senza MARKETING_APP_PASSWORD la UI è aperta: è lo sviluppo
// locale, dove il database è un file sul PC.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Le API v1 hanno la loro autenticazione a chiave: qui non si tocca nulla.
  if (pathname.startsWith("/api/v1")) return NextResponse.next();

  // Il controllo di stato resta PUBBLICO. Lo legge la pagina /stato del Hub, e
  // un health-check protetto dalla password non è un health-check: risponderebbe
  // "vai al login", cioè direbbe che l'app è giù ogni volta che è semplicemente
  // protetta. Non espone dati: solo se il server risponde e se il database
  // risponde a lui.
  if (pathname === "/api/health") return NextResponse.next();

  // Il cron di Vercel non ha cookie: se passasse di qui si prenderebbe un
  // redirect a /login, e un redirect è un 307 — cioè per Vercel la corsa
  // sarebbe "riuscita" e i dati non arriverebbero mai, senza che nessuno se ne
  // accorga. Non è aperto: si autentica da sé col CRON_SECRET.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const password = process.env.MARKETING_APP_PASSWORD;
  // ⚠️⚠️ **In produzione, senza password si CHIUDE, non si apre.** Il fail-open
  // serviva allo sviluppo locale, ma girava identico su Vercel: un rename o un
  // typo della variabile e il deploy successivo metteva online la memoria ADV,
  // le Impostazioni (dove sta anche il collegamento a Drive) e la coda delle
  // operazioni che SCRIVONO su Google Ads e Meta — senza che nessuno se ne
  // accorgesse, perché l'app «funziona» benissimo, solo per chiunque. Un 503
  // invece si vede subito. Stessa forma di deluxy-merchandising.
  if (!password && process.env.VERCEL) {
    return new NextResponse(
      "App non configurata: manca MARKETING_APP_PASSWORD. Per prudenza l'accesso resta chiuso.",
      { status: 503 },
    );
  }
  if (!password || pathname === "/login") return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
