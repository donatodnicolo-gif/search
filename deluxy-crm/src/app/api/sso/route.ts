import { NextRequest, NextResponse } from "next/server";
import { authAttiva, configAuthCompleta, creaSessione, DURATA_SESSIONE_S, inProduzione, SESSION_COOKIE } from "@/lib/auth";
import { leggiTokenSso } from "@/lib/sso";
import { isRuolo, type Ruolo } from "@/lib/ruoli";

// GET /api/sso?token=… — ingresso dal Deluxy Hub (Single Sign-On). Il Hub ha
// già riconosciuto la persona: qui si legge il token cifrato, si controlla che
// sia per QUESTA app e si apre la sessione del CRM senza chiedere la password
// di team. Token assente, scaduto, di un'altra app o con segreto diverso →
// login normale.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Sviluppo locale senza segreto: la UI è già aperta.
  if (!authAttiva()) return NextResponse.redirect(new URL("/", req.url));
  if (inProduzione() && !configAuthCompleta()) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  if (!payload || payload.app !== "crm") {
    // Un SSO che rimanda al login senza dire perché è impossibile da capire da
    // fuori: qui si scrive nel log quale controllo è fallito — mai il token.
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
    nome: payload.nome,
    email: payload.email?.trim().toLowerCase() || undefined,
    ruolo,
    via: "sso",
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
