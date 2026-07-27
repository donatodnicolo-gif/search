import { NextRequest, NextResponse } from "next/server";
import { chiave } from "./chiavi";

// Autenticazione delle API che questa app espone alle altre app Deluxy.
//
// Una chiave sola per tutta l'app (`BUDGETS_API_KEY`), letta con `chiave()`,
// quindi valida sia da variabile d'ambiente sia da Configurazione → Chiavi sia
// dalla cassaforte del Hub, nell'ordine deciso lì.
//
// Sta in un file suo perché il controllo va scritto **una volta**: ogni rotta
// che se lo riscrive è una rotta che prima o poi dimentica un pezzo — la
// pulizia dei caratteri invisibili, il confronto trimmato, il 503 quando la
// chiave non c'è.

// Caratteri invisibili che si incollano assieme a una chiave senza vedersi:
// spazi a larghezza zero, BOM, spazio unificatore. Con uno di questi in mezzo
// il confronto fallisce e l'errore non nomina nemmeno il colpevole.
const INVISIBILI = new RegExp("[​-‍﻿ ]", "g");

export async function autentica(req: NextRequest): Promise<NextResponse | null> {
  const attesa = await chiave("BUDGETS_API_KEY");
  if (!attesa) {
    return NextResponse.json(
      { errore: "BUDGETS_API_KEY non configurata su questa app: l'API è disattivata." },
      { status: 503 }
    );
  }
  const inviata = (req.headers.get("x-api-key") ?? "").replace(INVISIBILI, "").trim();
  if (!inviata || inviata !== attesa.trim()) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  return null;
}
