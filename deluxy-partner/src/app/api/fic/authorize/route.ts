import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ficCredenziali, ficAuthorizeUrl } from "@/lib/fic";

// Avvia il collegamento a Fatture in Cloud: reindirizza alla pagina di
// consenso. Lo state anti-CSRF viene verificato al ritorno nel callback.
export async function GET() {
  const { clientId } = await ficCredenziali();
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/impostazioni?errore=" + encodeURIComponent("Credenziali app Fatture in Cloud mancanti."), "https://deluxy-partner.vercel.app")
    );
  }
  const state = "fic-" + randomBytes(12).toString("hex");
  const res = NextResponse.redirect(ficAuthorizeUrl(clientId, state));
  res.cookies.set("fic_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
