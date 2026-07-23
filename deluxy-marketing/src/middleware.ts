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

  const password = process.env.MARKETING_APP_PASSWORD;
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
