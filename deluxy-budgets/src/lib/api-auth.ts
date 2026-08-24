import { NextRequest, NextResponse } from "next/server";
import { chiave } from "./chiavi";
import { scriveQualcosa, verificaChiaveEmessa } from "./chiavi-emesse";

// Autenticazione delle API che questa app espone alle altre app Deluxy.
//
// Due strade, provate in quest'ordine:
//
// 1. **Chiavi emesse da qui** (Configurazione → Chiavi): una per app, con scope
//    `lettura` o `scrittura`, revocabile da sola. È la strada buona.
// 2. **`BUDGETS_API_KEY`**, la chiave unica che c'era prima. Resta valida perché
//    Marketing la usa già e toglierla di colpo romperebbe un'app in produzione,
//    ma vale **solo in lettura**: una chiave condivisa, incollata in più posti e
//    che nessuno può revocare senza rompere tutti gli altri, non deve poter
//    scrivere nel budget dell'azienda.
//
// ⚠️ Lo scope si decide dal **metodo HTTP**, non da un parametro che la rotta
// deve ricordarsi di passare: una rotta di scrittura nuova nasce protetta anche
// se chi la scrive si dimentica di dichiararlo.

// Caratteri invisibili che si incollano assieme a una chiave senza vedersi:
// spazi a larghezza zero, BOM, spazio unificatore. Con uno di questi in mezzo
// il confronto fallisce e l'errore non nomina nemmeno il colpevole.
const INVISIBILI = new RegExp("[​-‍﻿ ]", "g");

const pulisci = (v: string | null) => (v ?? "").replace(INVISIBILI, "").trim();

// `opzioni.scrive` forza lo scope quando il metodo mente. Serve a una rotta
// sola: `/api/v1/categorie/proponi` è un POST perché ha un corpo, ma **non
// cambia niente** — chiede all'AI come classificherebbe delle spese e risponde.
// Trattarla come scrittura obbligherebbe Finance a una chiave che può scrivere
// nel budget per fare una domanda.
export async function autentica(
  req: NextRequest,
  opzioni: { scrive?: boolean } = {}
): Promise<NextResponse | null> {
  const inviata = pulisci(req.headers.get("x-api-key"));
  const serveScrittura = opzioni.scrive ?? scriveQualcosa(req.method);

  if (!inviata) {
    return NextResponse.json(
      { errore: "Chiave API mancante (header X-API-Key)." },
      { status: 401 }
    );
  }

  // ---- 1. Le chiavi emesse da questa app ----
  const esito = await verificaChiaveEmessa(inviata, serveScrittura);
  if (esito.ok) return null;
  if (esito.motivo === "revocata") {
    return NextResponse.json(
      { errore: "Questa chiave è stata revocata. Chiedine una nuova in Budgets → Configurazione → Chiavi." },
      { status: 401 }
    );
  }
  if (esito.motivo === "scope") {
    // ⭐ Si dice **perché**: «401» su una chiave giusta manda a cercare un
    // problema di chiave, quando il problema è il permesso.
    return NextResponse.json(
      { errore: `Questa chiave è di sola lettura: ${req.method} richiede una chiave con scope «scrittura».` },
      { status: 403 }
    );
  }

  // ---- 2. La vecchia chiave unica, solo in lettura ----
  const condivisa = await chiave("BUDGETS_API_KEY");
  if (condivisa && pulisci(condivisa) === inviata) {
    if (serveScrittura) {
      return NextResponse.json(
        {
          errore:
            "BUDGETS_API_KEY è una chiave condivisa e vale solo in lettura. " +
            "Per scrivere serve una chiave emessa a nome della tua app (Budgets → Configurazione → Chiavi).",
        },
        { status: 403 }
      );
    }
    return null;
  }

  return NextResponse.json({ errore: "Chiave API non valida (header X-API-Key)." }, { status: 401 });
}
