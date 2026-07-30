import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { leggiSessione } from "@/lib/sessione";

// Chi può entrare, e dove.
//
// Due modi di entrare, di proposito:
//  1. **dal Hub** (Single Sign-On): il cookie è una sessione **firmata** che
//     porta nome e ruolo. È così che entrano le persone, ognuna con le proprie
//     credenziali, aggiunte e tolte dal Hub;
//  2. **con la password unica di team**: resta come via di riserva — se il Hub
//     è irraggiungibile o si lavora in locale si entra lo stesso, con pieni
//     poteri, perché quella password ce l'ha chi amministra.
//
// Il ruolo viaggia **dentro il cookie firmato** e non in un parametro: chi
// provasse a scriversi «admin» produrrebbe una firma che non torna.
//
// Le pagine che un non-admin può vedere sono solo quelle delle proposte: qui
// dentro ci sono stipendi, premi e margini, e chi entra per mandare il proprio
// budget non ha bisogno di sapere quanto guadagnano gli altri.
const APERTE_A_TUTTI = ["/proposte", "/api/proposte"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // `/login` e `/api/sso` sono le due porte: se fossero protette non si
  // potrebbe entrare da nessuna parte.
  if (pathname === "/login" || pathname === "/api/sso") return NextResponse.next();

  // `/api/health` è il controllo di salute che legge la pagina Stato servizi
  // del Hub, che qui non ha una sessione. Non dice nulla di riservato: solo se
  // il server risponde e se il database risponde.
  if (pathname === "/api/health") return NextResponse.next();

  const password = process.env.BUDGETS_APP_PASSWORD;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;

  // Sviluppo locale senza password: l'app è aperta, come prima.
  if (!password) return NextResponse.next();

  // 1) Sessione firmata (Hub). Porta il ruolo con sé.
  const sessione = await leggiSessione(cookie);
  if (sessione) {
    if (sessione.ruolo === "admin") return NextResponse.next();

    // **Sola lettura**: vede tutte le pagine, non scrive niente. Il blocco è sul
    // **metodo**, non sui bottoni: nascondere un pulsante è un cartello, questa
    // è la serratura. Ferma anche le server action, che sono POST verso la
    // pagina stessa — quindi non si modifica nemmeno passando di lato.
    if (sessione.ruolo === "lettura") {
      if (req.method === "GET" || req.method === "HEAD") return NextResponse.next();
      // Chiudere la propria sessione non è una modifica dei dati.
      if (pathname === "/api/logout" || pathname === "/login") return NextResponse.next();
      return NextResponse.json(
        { error: "Profilo in sola lettura: puoi consultare tutto, ma non modificare." },
        { status: 403 }
      );
    }

    const permesso = APERTE_A_TUTTI.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (permesso) return NextResponse.next();
    // Non un errore: si viene portati dove si può stare.
    return NextResponse.redirect(new URL("/proposte", req.url));
  }

  // 2) Password di team: accesso pieno, come è sempre stato.
  if (cookie && cookie === (await sessionToken(password))) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // `api/v1` è fuori: è l'API per le ALTRE app Deluxy e si autentica da sé con
  // la chiave (X-API-Key). Lasciandola dentro, il middleware risponderebbe con
  // un redirect alla pagina di login e il chiamante leggerebbe HTML al posto
  // del JSON, senza capire perché.
  matcher: ["/((?!api/v1|_next/static|_next/image|favicon.ico).*)"],
};
