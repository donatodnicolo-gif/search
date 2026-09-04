import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export function GET(req: NextRequest) {
  // Dopo un cambio password dall'interno si arriva qui con ?reimpostata=1:
  // il login lo mostra come conferma.
  const dest = new URL("/login", req.url);
  if (req.nextUrl.searchParams.get("reimpostata")) dest.searchParams.set("reimpostata", "1");
  const res = NextResponse.redirect(dest);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
