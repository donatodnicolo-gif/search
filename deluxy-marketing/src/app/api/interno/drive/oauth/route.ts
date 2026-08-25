import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AMBITI_CONSENSO,
  IMP_OAUTH_EMAIL,
  IMP_OAUTH_REFRESH,
  oauthConfigurato,
} from "@/lib/drive-scrittura";

// Il giro del consenso per collegare Drive come utente.
//
// Due passaggi, stessa rotta:
//   1. senza "code" → si manda la persona da Google a dare il consenso;
//   2. con "code"   → Google la rimanda qui e si scambia il codice con il
//      permesso duraturo (refresh token), che è ciò che serve per scrivere
//      anche domani senza chiedere di nuovo.
//
// Sta sotto /api/interno, quindi la protegge la password dell'app: il ritorno
// da Google avviene nel browser di chi è già entrato.

function indirizzoRitorno(req: NextRequest): string {
  return new URL("/api/interno/drive/oauth", req.nextUrl.origin).toString();
}

export async function GET(req: NextRequest) {
  const o = await oauthConfigurato();
  if (!o.id || !o.segreto) {
    return NextResponse.redirect(new URL("/impostazioni?salvato=drive-oauth-manca", req.nextUrl.origin));
  }

  const codice = req.nextUrl.searchParams.get("code");
  const errore = req.nextUrl.searchParams.get("error");
  if (errore) {
    return NextResponse.redirect(
      new URL(`/impostazioni?salvato=drive-oauth-negato&perche=${encodeURIComponent(errore)}`, req.nextUrl.origin)
    );
  }

  // Passo 1 — si va a chiedere il consenso.
  if (!codice) {
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", o.id);
    auth.searchParams.set("redirect_uri", indirizzoRitorno(req));
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", AMBITI_CONSENSO);
    // "offline" + "consent" servono a ottenere il permesso duraturo: senza,
    // Google dà solo un accesso di un'ora e domani l'app non scrive più.
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    return NextResponse.redirect(auth);
  }

  // Passo 2 — il codice diventa permesso duraturo.
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: codice,
        client_id: o.id,
        client_secret: o.segreto,
        redirect_uri: indirizzoRitorno(req),
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    const d = (await r.json()) as {
      refresh_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!r.ok || !d.refresh_token) {
      const perche =
        d.error_description ??
        d.error ??
        "Google non ha restituito il permesso duraturo: se avevi già collegato quest'app, revoca l'accesso da myaccount.google.com e riprova.";
      return NextResponse.redirect(
        new URL(`/impostazioni?salvato=drive-oauth-no&perche=${encodeURIComponent(perche.slice(0, 200))}`, req.nextUrl.origin)
      );
    }

    // Chi ha dato il consenso: si scrive accanto, o fra un mese nessuno
    // ricorda con quale account l'app sta scrivendo.
    let email = "";
    if (d.access_token) {
      const chi = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${d.access_token}` },
        cache: "no-store",
      }).catch(() => null);
      if (chi?.ok) email = ((await chi.json()) as { email?: string }).email ?? "";
    }

    await prisma.impostazione.upsert({
      where: { chiave: IMP_OAUTH_REFRESH },
      update: { valore: d.refresh_token },
      create: { chiave: IMP_OAUTH_REFRESH, valore: d.refresh_token },
    });
    if (email) {
      await prisma.impostazione.upsert({
        where: { chiave: IMP_OAUTH_EMAIL },
        update: { valore: email },
        create: { chiave: IMP_OAUTH_EMAIL, valore: email },
      });
    }

    return NextResponse.redirect(new URL("/impostazioni?salvato=drive-oauth-ok", req.nextUrl.origin));
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/impostazioni?salvato=drive-oauth-no&perche=${encodeURIComponent(String(e).slice(0, 160))}`,
        req.nextUrl.origin
      )
    );
  }
}
