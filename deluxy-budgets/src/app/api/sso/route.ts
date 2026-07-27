import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { creaSessione, DURATA_GIORNI } from "@/lib/sessione";
import { leggiTokenSso } from "@/lib/sso";

// GET /api/sso?token=… — ingresso dal Hub (Single Sign-On).
//
// È il modo in cui **più persone** entrano in quest'app: gli utenti stanno nel
// Hub — con la loro email, il loro ruolo e le app che possono aprire — e qui
// arriva un token cifrato che dice chi sono. Budgets non tiene un elenco di
// utenti suo: due elenchi che divergono sono il modo più veloce per lasciare
// dentro qualcuno che è stato tolto.
//
// Il ruolo del Hub si mappa sui due profili di Budgets:
//   admin        → tutto
//   tutto il resto → solo le proposte di budget
// Perché così: in queste pagine ci sono stipendi, premi e margini. Chi entra
// per mandare il proprio budget non ha bisogno di vedere quanto guadagnano gli
// altri, e «non ne ha bisogno» è il criterio giusto per un permesso.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? leggiTokenSso(token) : null;

  // Token assente, scaduto o destinato a un'altra app: si finisce al login
  // normale, senza dire quale delle tre cose è andata storta.
  if (!payload || payload.app !== "budgets") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ruolo = payload.ruolo === "admin" ? "admin" : "proposte";
  // Un non-admin atterra dove può stare, non sulla home che gli sarebbe negata.
  const dove = ruolo === "admin" ? "/" : "/proposte";
  const res = NextResponse.redirect(new URL(dove, req.url));
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
  return res;
}
