import { NextRequest, NextResponse } from "next/server";
import { authAttiva, creaSessione, DURATA_SESSIONE_S, SESSION_COOKIE } from "@/lib/auth";
import { leggiTokenSso } from "@/lib/sso";
import { isRuolo, type Ruolo } from "@/lib/ruoli";

// GET /api/sso?token=… — ingresso dal Deluxy Hub (Single Sign-On). Il Hub ha
// già riconosciuto l'utente: qui si legge il token cifrato, si controlla che
// sia per questa app e si apre la sessione senza chiedere la password. Token
// assente, scaduto, di un'altra app o con segreto sbagliato → login normale.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  // Auth disattivata (sviluppo locale senza segreti): la UI è già aperta.
  if (!authAttiva()) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!payload || payload.app !== "personale") {
    // Un SSO che rimanda al login senza dire perché è impossibile da capire da
    // fuori: nel log si scrive quale controllo è fallito — mai token né segreto.
    const motivo = !token
      ? "token assente"
      : !payload
        ? "token non decifrabile o scaduto (segreto diverso dal Hub?)"
        : `token per un'altra app: ${payload.app}`;
    console.warn(`SSO rifiutato: ${motivo}`);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ruolo: Ruolo = isRuolo(payload.ruolo) ? payload.ruolo : "commerciale";
  const sessione = await creaSessione({
    email: payload.email?.trim().toLowerCase() ?? "",
    nome: payload.nome,
    ruolo,
  });

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
