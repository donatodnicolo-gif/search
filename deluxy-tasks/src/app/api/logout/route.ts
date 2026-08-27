import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Uscita dall'app: svuota il cookie di sessione e torna al login.
// (Libro UX&UI cap.1: nella topbar utente e logout sempre visibili — prima
// si «usciva» solo aspettando la scadenza del cookie, 30 giorni.)
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
