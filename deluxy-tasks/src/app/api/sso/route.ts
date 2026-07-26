import { NextRequest, NextResponse } from "next/server";
import { creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE } from "@/lib/auth";
import { leggiTokenSso } from "@/lib/sso";
import { isRuolo, type Ruolo } from "@/lib/ruoli";

// GET /api/sso?token=… — ingresso dal Deluxy Hub (Single Sign-On). Il Hub ha già
// riconosciuto l'utente: qui si legge il token cifrato, si controlla che sia per
// questa app e si apre la sessione di Tasks senza chiedere di nuovo la password.
// Token assente, scaduto, di un'altra app o con segreto sbagliato → login normale.
//
// L'identità in Tasks è l'EMAIL: se il token non la porta (Hub vecchio) non si
// può decidere di chi sono le task, quindi si passa dal login.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  // Auth disattivata (sviluppo locale senza segreto): la UI è già aperta.
  if (!process.env.TASKS_SESSION_SECRET) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const email = payload?.email?.trim().toLowerCase();
  if (!payload || payload.app !== "tasks" || !email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ruolo: Ruolo = isRuolo(payload.ruolo) ? payload.ruolo : "commerciale";
  const sessione = await creaSessione({ email, nome: payload.nome, ruolo });

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(SESSION_COOKIE, sessione, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURATA_SESSIONE_S,
    path: "/",
  });
  return res;
}
