import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { leggiTokenSso } from "@/lib/sso";

// GET /api/sso?token=… — ingresso dal Deluxy Hub (Single Sign-On). Il Hub ha già
// riconosciuto la persona: qui si legge il token cifrato, si controlla che sia
// per questa app e si apre la sessione di Scripts senza richiedere la password
// del team. Token assente, scaduto, di un'altra app o con segreto diverso →
// login normale, come prima.
//
// Scripts non ha utenti propri: la sua porta è una password unica del team, e la
// tessera nel Hub è riservata agli admin. Il token, quindi, serve solo a dire
// «questa persona è già entrata dal portale»: non porta dentro nessun ruolo.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const password = process.env.SCRIPTS_APP_PASSWORD;
  // Senza password l'app è aperta (sviluppo locale): non c'è nessuna sessione da
  // aprire, si entra e basta.
  if (!password) return NextResponse.redirect(new URL("/", req.url));

  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;
  if (!payload || payload.app !== "scripts") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni, come il login normale
    path: "/",
  });
  return res;
}
