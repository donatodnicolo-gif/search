import { NextRequest, NextResponse } from "next/server";
import { catalogoApp } from "@/lib/apps";
import { creaTokenSso } from "@/lib/sso";
import { sessioneCorrente } from "@/lib/sessione-server";

// GET /vai/<appId> — apertura di un'app dalla home. Se l'app supporta il Single
// Sign-On (campo `sso`) e il segreto è configurato, il Hub genera un token
// cifrato di breve durata e reindirizza a <appUrl>/api/sso?token=…, così l'utente
// entra senza rifare il login. Altrimenti (o se l'admin ha forzato il login
// proprio) apre l'app normalmente e sarà lei a chiedere l'accesso.

export const dynamic = "force-dynamic";

const DURATA_TOKEN_MS = 60_000; // 60s: il token serve solo per il salto Hub→app

export async function GET(req: NextRequest, ctx: { params: Promise<{ app: string }> }) {
  const sessione = await sessioneCorrente();
  if (!sessione) {
    const login = new URL("/login", req.url);
    return NextResponse.redirect(login);
  }

  const { app: appId } = await ctx.params;
  const app = catalogoApp().find((a) => a.id === appId);
  if (!app) return NextResponse.redirect(new URL("/", req.url));

  if (app.sso) {
    try {
      const token = creaTokenSso({
        uid: sessione.uid,
        nome: sessione.nome,
        ruolo: sessione.ruolo,
        app: app.id,
        exp: Date.now() + DURATA_TOKEN_MS,
      });
      const dest = new URL("/api/sso", app.url);
      dest.searchParams.set("token", token);
      return NextResponse.redirect(dest);
    } catch {
      // HUB_SSO_SECRET non configurato: apri l'app normalmente (farà il suo login).
    }
  }

  return NextResponse.redirect(app.url);
}
