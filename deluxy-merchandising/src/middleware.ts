import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Protezione della UI con password unica del team, come le altre app Deluxy.
// Qui dentro ci sono costi e margini di prodotto: senza password l'app NON va
// pubblicata. Se MERCHANDISING_APP_PASSWORD non è impostata (sviluppo locale)
// la UI resta aperta.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Le API hanno la **loro** autenticazione (chiave x-api-key, vedi
  // src/lib/api-auth.ts): passandole di qui rispondevano con la pagina di
  // login, e chi integra vedeva HTML dove si aspettava JSON.
  // Eccezione: /api/ai/* è usata dal form dentro l'app, quindi resta protetta
  // dal cookie come il resto della UI.
  if (pathname.startsWith("/api/v1/")) return NextResponse.next();

  // /api/health è il controllo di salute che legge la pagina Stato servizi del
  // Hub, che non ha una sessione di questa app. Non espone dati: risponde solo
  // se il server e il database rispondono (due booleani).
  if (pathname === "/api/health") return NextResponse.next();

  // /api/cron/* lo chiama il cron di Vercel, che manda l'header
  // "Authorization: Bearer <CRON_SECRET>" ma **non ha il cookie di sessione**:
  // passando di qui veniva dirottato al login e il giro automatico non partiva
  // mai, in silenzio. Ha la sua autenticazione, più forte della password del
  // team: senza CRON_SECRET la rotta risponde 503 da sola.
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();

  const password = process.env.MERCHANDISING_APP_PASSWORD;
  // **In produzione, senza password si chiude, non si apre.** Il fail-open
  // serve allo sviluppo locale, ma girava identico su Vercel: un rename o un
  // typo della variabile e il deploy successivo metteva online costi, margini,
  // Impostazioni e le azioni che scrivono su Shopify — senza che nessuno se ne
  // accorgesse, perché l'app «funziona». Un 503 invece si vede subito.
  if (!password && process.env.VERCEL) {
    return new NextResponse(
      "App non configurata: manca MERCHANDISING_APP_PASSWORD. Per prudenza l'accesso resta chiuso.",
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

// I percorsi pubblici sono esclusi **anche dal matcher**, non solo con un
// return dentro la funzione: così il middleware non gira nemmeno, e non c'è
// modo che una modifica futura al codice qui sopra rimetta la password davanti
// al controllo di stato che legge il Hub.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/health|api/v1|api/cron).*)"],
};
