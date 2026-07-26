import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

// Protezione della UI con password unica del team, come le altre app Deluxy.
// Qui dentro ci sono budget, premi e costi del personale: senza password
// l'app NON va pubblicata. Se BUDGETS_APP_PASSWORD non è impostata (sviluppo
// locale) la UI resta aperta.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const password = process.env.BUDGETS_APP_PASSWORD;
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
