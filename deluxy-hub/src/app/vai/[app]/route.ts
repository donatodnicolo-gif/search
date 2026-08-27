import { NextRequest, NextResponse } from "next/server";
import { catalogoApp } from "@/lib/apps";
import { prisma } from "@/lib/db";
import { appVisibili } from "@/lib/permessi";
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

  // Il gate dei permessi è QUI, non solo nelle tessere della home: senza,
  // chiunque abbia una sessione poteva chiamare /vai/<app> a mano e farsi
  // coniare un token SSO per un'app non sua — comprese quelle solo-admin
  // (Personale = stipendi). Il portale deve decidere chi entra, non delegarlo
  // all'app di destinazione. `appVisibili` incrocia ruolo (fresco dal DB) e
  // appAbilitate; per un admin resta l'intero catalogo.
  const viste = await appVisibili(sessione);
  if (!viste.some((a) => a.id === app.id)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (app.sso) {
    try {
      // Alcune app (Tasks) riconoscono l'utente dall'email, non dall'id del Hub:
      // la si legge qui una volta sola e viaggia dentro il token cifrato.
      const utente = await prisma.utente.findUnique({
        where: { id: sessione.uid },
        select: { email: true },
      });
      const token = creaTokenSso({
        uid: sessione.uid,
        email: utente?.email,
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
