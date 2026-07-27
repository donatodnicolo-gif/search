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

  const password = process.env.MERCHANDISING_APP_PASSWORD;
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
