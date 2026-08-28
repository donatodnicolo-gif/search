import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, leggiSessione } from "@/lib/session";
import { daMobile } from "@/lib/dispositivo";

export async function middleware(req: NextRequest) {
  // La cassaforte /api/chiavi è server-to-server: si autentica col proprio token
  // di servizio (dentro la route), non con la sessione utente del portale.
  if (req.nextUrl.pathname.startsWith("/api/chiavi")) return NextResponse.next();

  const sessione = await leggiSessione(req.cookies.get(SESSION_COOKIE)?.value);

  if (!sessione) {
    const login = new URL("/login", req.url);
    login.searchParams.set("da", req.nextUrl.pathname);
    const risposta = NextResponse.redirect(login);
    risposta.cookies.delete(SESSION_COOKIE); // sessione scaduta o firma non valida
    return risposta;
  }

  // Gestione utenti, chiavi dei progetti e stato dei servizi: solo per gli
  // amministratori.
  const soloAdmin =
    req.nextUrl.pathname.startsWith("/utenti") ||
    req.nextUrl.pathname.startsWith("/chiavi") ||
    req.nextUrl.pathname.startsWith("/stato");
  if (soloAdmin && sessione.ruolo !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Cartellino: si timbra solo da una postazione desktop. Il controllo è qui
  // (vale per pagine, form e server action, che passano tutte da qui) e viene
  // ripetuto lato server in richiediDesktop(). La pagina che spiega la regola
  // deve restare raggiungibile anche dal telefono, altrimenti si gira in tondo.
  const cartellino = req.nextUrl.pathname.startsWith("/cartellino");
  if (
    cartellino &&
    !req.nextUrl.pathname.startsWith("/cartellino/solo-desktop") &&
    daMobile(req.headers.get("user-agent"), req.headers.get("sec-ch-ua-mobile"))
  ) {
    return NextResponse.redirect(new URL("/cartellino/solo-desktop", req.url));
  }

  // Le richieste degli altri le decide un amministratore; il proprio cartellino
  // resta di tutti.
  if (req.nextUrl.pathname.startsWith("/cartellino/gestione") && sessione.ruolo !== "admin") {
    return NextResponse.redirect(new URL("/cartellino", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // "api" è escluso: le route API si autenticano da sole (token di servizio),
  // non con il cookie di sessione — il middleware le reindirizzerebbe al login.
  //
  // Esclusi anche i file della PWA (manifest, service worker, icone): devono
  // essere raggiungibili SENZA sessione, altrimenti il browser riceve la pagina
  // di login al posto del file e l'app non si installa. Non sono segreti: sono
  // fatti apposta per essere pubblici.
  matcher: [
    "/((?!api|login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|icon-512-maskable.png|apple-touch-icon.png).*)",
  ],
};
