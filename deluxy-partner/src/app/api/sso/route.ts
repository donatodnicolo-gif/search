import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { leggiTokenSso } from "@/lib/sso";
import { COOKIE_UTENTE, cookieUtente } from "@/lib/registro";

// GET /api/sso?token=… — ingresso dal Hub (Single Sign-On). Verifica il token
// cifrato del Hub e, se valido, imposta il cookie di sessione di Partner senza
// chiedere la password di team. Mappa il ruolo del Hub sui due profili di
// Partner: admin → accesso pieno, tutto il resto → sola lettura.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  // Token assente/scaduto/non nostro: manda al login normale dell'app.
  if (!payload || payload.app !== "partner") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const passwordPiena = process.env.PARTNER_APP_PASSWORD;
  const passwordReadonly = process.env.PARTNER_APP_PASSWORD_READONLY;

  // In sviluppo locale l'app può essere aperta (nessuna password): entra e basta.
  if (!passwordPiena) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const usata =
    payload.ruolo === "admin" ? passwordPiena : passwordReadonly || passwordPiena;

  const res = NextResponse.redirect(new URL("/", req.url));
  const opzioni = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 giorni, come il login manuale
    path: "/",
  };
  res.cookies.set(SESSION_COOKIE, await sessionToken(usata), opzioni);
  // Nome dell'operatore per il registro modifiche (chi ha fatto cosa): col login
  // a password non lo sappiamo, col SSO del Hub sì.
  res.cookies.set(COOKIE_UTENTE, cookieUtente(payload.nome, payload.uid), { ...opzioni, httpOnly: false });
  return res;
}
