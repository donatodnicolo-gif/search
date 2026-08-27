import { randomBytes } from "crypto";
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

// Il cookie che lega l'andata al ritorno. Sta solo su questa rotta (`path`),
// dura dieci minuti e non è leggibile da JavaScript.
const COOKIE_STATE = "dmk_drive_state";

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
    // ⚠️ `state` — il giro deve averlo cominciato QUESTO browser (27/08/2026,
    // revisione di sicurezza). Senza, chiunque poteva avviare il consenso per
    // conto suo, autorizzare col PROPRIO account Google, prendersi il `code` e
    // far aprire a chi è già dentro un link «…/oauth?code=<il suo>»: è una
    // navigazione di primo livello, quindi `SameSite=Lax` manda il cookie, la
    // rotta gira come l'operatore e salva il permesso di un estraneo.
    // Il danno non era l'esfiltrazione — la cartella di destinazione è un id
    // fisso, quindi col token sbagliato il ponte non trova la cartella e si
    // ferma — ma il ponte verso Drive smetteva di depositare, e capirne il
    // perché costa più che impedirlo.
    // ⚠️ `state` si mette nell'URL PRIMA di costruire la risposta:
    // `NextResponse.redirect` fotografa l'indirizzo al momento della chiamata,
    // e un parametro aggiunto dopo non partirebbe.
    const state = randomBytes(16).toString("hex");
    auth.searchParams.set("state", state);
    const risposta = NextResponse.redirect(auth);
    risposta.cookies.set(COOKIE_STATE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // dieci minuti: il tempo di dare il consenso, non di più
      path: "/api/interno/drive/oauth",
    });
    return risposta;
  }

  // ⚠️ Il ritorno da Google si accetta solo se combacia col cookie di andata.
  // Un `state` mancante o diverso vuol dire che questo giro l'ha cominciato
  // qualcun altro: si rifiuta prima di scambiare il codice.
  const statoAtteso = req.cookies.get(COOKIE_STATE)?.value ?? "";
  const statoRicevuto = req.nextUrl.searchParams.get("state") ?? "";
  if (!statoAtteso || !statoRicevuto || statoAtteso !== statoRicevuto) {
    const via = NextResponse.redirect(
      new URL("/impostazioni?salvato=drive-oauth-scaduto", req.nextUrl.origin)
    );
    via.cookies.delete(COOKIE_STATE);
    return via;
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

    // Il biglietto d'andata si strappa appena è servito: un `state` che resta
    // valido è un `state` riutilizzabile.
    const fatto = NextResponse.redirect(new URL("/impostazioni?salvato=drive-oauth-ok", req.nextUrl.origin));
    fatto.cookies.delete(COOKIE_STATE);
    return fatto;
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/impostazioni?salvato=drive-oauth-no&perche=${encodeURIComponent(String(e).slice(0, 160))}`,
        req.nextUrl.origin
      )
    );
  }
}
