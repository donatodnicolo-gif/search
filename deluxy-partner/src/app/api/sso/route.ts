import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { creaSessione, DURATA_GIORNI } from "@/lib/sessione";
import { leggiTokenSso } from "@/lib/sso";
import { COOKIE_UTENTE } from "@/lib/registro";
import { registraAccesso } from "@/lib/accessi";

// GET /api/sso?token=… — ingresso dal Hub (Single Sign-On). Verifica il token
// cifrato del Hub e, se valido, apre la sessione senza chiedere nessuna
// password. Il ruolo del Hub si mappa sui due profili di Partner: admin →
// accesso pieno, tutto il resto → sola lettura.
//
// Prima di avere le sessioni firmate, qui si riusavano le PASSWORD di team per
// costruire il cookie: funzionava, ma il cookie non portava il nome e — se
// PARTNER_APP_PASSWORD_READONLY non era impostata — un utente non-admin del Hub
// finiva dentro con accesso pieno. Ora il ruolo viaggia firmato nel cookie e le
// password di team non c'entrano più.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  // Token assente/scaduto/non nostro: manda al login normale dell'app.
  if (!payload || payload.app !== "partner") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // In sviluppo locale l'app può essere aperta (nessuna password): entra e basta.
  if (!process.env.PARTNER_APP_PASSWORD) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const ruolo = payload.ruolo === "admin" ? "admin" : "sola_lettura";
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(
    SESSION_COOKIE,
    await creaSessione({ uid: payload.uid, email: "", nome: payload.nome, ruolo, via: "sso" }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * DURATA_GIORNI,
      path: "/",
    }
  );
  // Il nome ora sta nella sessione firmata: il vecchio cookie in chiaro non
  // serve più e non deve restare in giro a raccontare un'identità non verificata.
  res.cookies.delete(COOKIE_UTENTE);

  await registraAccesso(
    { utente: payload.nome, utenteId: payload.uid, ruolo, via: "sso" },
    req.headers
  );
  return res;
}
