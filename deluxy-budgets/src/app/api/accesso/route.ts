import { NextResponse } from "next/server";
import { attiva, rimuovi, salvaSegreto, segretoAccesso, statoAccesso } from "@/lib/accesso";
import { cifraturaConfigurata } from "@/lib/crypto";
import { codiceTotpValido, generaSegretoTotp, uriTotp } from "@/lib/totp";

// Registrazione e rimozione del secondo fattore. Ci si arriva solo da dentro
// l'app (il middleware protegge tutto tranne /login), quindi chi chiama ha già
// la password: il codice serve a **confermare** che l'app di autenticazione è
// stata davvero configurata, non a fare da guardia a questa rotta.

export async function POST(req: Request) {
  if (!cifraturaConfigurata()) {
    return NextResponse.json(
      { error: "APP_SECRET non configurata: senza non si può registrare un secondo fattore." },
      { status: 400 }
    );
  }
  const b = await req.json().catch(() => null);
  const azione = String(b?.azione ?? "");

  // 1) Genera un segreto nuovo. Resta INATTIVO finché non lo si conferma: un
  //    segreto generato e mai messo nell'app di autenticazione non deve poter
  //    chiudere fuori nessuno.
  if (azione === "genera") {
    const segreto = generaSegretoTotp();
    await salvaSegreto(segreto);
    return NextResponse.json({ ok: true, segreto, uri: uriTotp(segreto, "team") });
  }

  // 2) Conferma col primo codice: da qui in poi serve a tutti per entrare.
  if (azione === "conferma") {
    const segreto = await segretoAccesso();
    if (!segreto) return NextResponse.json({ error: "Nessun segreto da confermare." }, { status: 400 });
    if (!codiceTotpValido(segreto, String(b?.codice ?? ""))) {
      return NextResponse.json({ error: "Codice non valido: riprova col codice mostrato adesso." }, { status: 400 });
    }
    await attiva();
    return NextResponse.json({ ok: true });
  }

  // 3) Rimozione: richiede un codice valido. Chi è dentro potrebbe averlo
  //    trovato aperto su un computer altrui — togliere la protezione deve
  //    costare quanto averla.
  if (azione === "rimuovi") {
    const stato = await statoAccesso();
    const segreto = await segretoAccesso();
    if (stato.obbligatorio && segreto && !codiceTotpValido(segreto, String(b?.codice ?? ""))) {
      return NextResponse.json({ error: "Serve un codice valido per togliere il secondo fattore." }, { status: 400 });
    }
    await rimuovi();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "azione non prevista" }, { status: 400 });
}
