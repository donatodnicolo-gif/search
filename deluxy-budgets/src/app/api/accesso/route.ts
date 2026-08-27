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
    // ⚠️⚠️ **RIGENERARE È ANCHE SPEGNERE** (chiuso il 27/08/2026).
    //
    // `salvaSegreto` scrive `note: null`, e `note === "attivo"` è l'**unico**
    // segnale che il secondo fattore è acceso. Quindi un `genera` su un TOTP
    // già attivo lo **disattivava**, senza chiedere nessun codice — mentre
    // `rimuovi`, dieci righe più sotto, il codice lo chiede, e il commento
    // accanto dichiara «togliere la protezione deve costare quanto averla».
    // C'erano due porte per la stessa stanza, e una non aveva serratura.
    //
    // ⭐ Non conta come si chiama l'azione: conta che cosa **lascia dietro**.
    // Un'azione che nel suo effetto contiene una disattivazione è una
    // disattivazione, e va protetta come tale.
    const gia = await statoAccesso();
    if (gia.obbligatorio) {
      const attuale = await segretoAccesso();
      if (attuale && !codiceTotpValido(attuale, String(b?.codice ?? ""))) {
        return NextResponse.json(
          { error: "Il secondo fattore è già attivo: per rigenerarlo serve un codice valido di quello in uso." },
          { status: 400 }
        );
      }
    }
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
