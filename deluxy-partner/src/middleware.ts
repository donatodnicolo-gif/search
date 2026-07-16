import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.PARTNER_APP_PASSWORD;
  if (!password) return NextResponse.next(); // sviluppo locale: aperta

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }
  const login = new URL("/login", req.url);
  return NextResponse.redirect(login);
}

export const config = {
  // tutto tranne login, asset statici e file pubblici
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
