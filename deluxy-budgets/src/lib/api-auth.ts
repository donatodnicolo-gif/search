import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { chiave } from "./chiavi";
import { scriveQualcosa, verificaChiaveEmessa } from "./chiavi-emesse";

/**
 * Confronto a **tempo costante**, come già fanno le chiavi emesse.
 *
 * ⚠️ Un `===` esce al primo carattere diverso, e dal tempo di risposta si
 * indovina il prefisso una lettera per volta. Su una funzione serverless, fra
 * jitter di rete e avvii a freddo, il segnale è quasi sempre sepolto nel rumore
 * — ma era **l'unica delle due strade di questo file a non seguire la regola
 * scritta nell'altra**, e una difesa che vale solo su metà degli ingressi non è
 * una difesa: è una svista che sembra una scelta.
 *
 * La lunghezza si confronta prima e in chiaro: `timingSafeEqual` pretende due
 * buffer della stessa misura, e la lunghezza di una chiave non è il segreto.
 */
function ugualeATempoCostante(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

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
/**
 * CHI STA CHIAMANDO: la chiave **emessa** che ha aperto la porta, oppure la
 * chiave **condivisa**.
 *
 * ⚠️ Serve perché lo scope da solo non basta a decidere tutto. `autentica()`
 * guarda il **metodo HTTP**: giusto per separare chi legge da chi scrive, ma
 * cieco su una domanda diversa — *questa lettura, chiunque può farla?* Gli
 * stipendi di `/api/v1/team?compensi=1` sono una lettura come le altre per il
 * metodo, e una cosa completamente diversa per chi la subisce.
 *
 * ⭐ La chiave **condivisa** non è una chiave di qualcuno: gira negli `.env` di
 * Hub, Anagrafiche, Finance e Marketing, non si può revocare da sola e non
 * lascia traccia di chi l'ha usata. Va bene per leggere un elenco di categorie;
 * non va bene per leggere quanto guadagnano le persone.
 */
export type Chiamante =
  | { tipo: "emessa"; nome: string; scrittura: boolean }
  | { tipo: "condivisa" }
  | null;

export async function chiamante(req: NextRequest): Promise<Chiamante> {
  const inviata = pulisci(req.headers.get("x-api-key"));
  if (!inviata) return null;
  const esito = await verificaChiaveEmessa(inviata, false);
  if (esito.ok) return { tipo: "emessa", nome: esito.nome, scrittura: esito.scope === "scrittura" };
  const condivisa = await chiave("BUDGETS_API_KEY");
  if (condivisa && ugualeATempoCostante(pulisci(condivisa), inviata)) return { tipo: "condivisa" };
  return null;
}

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
  if (condivisa && ugualeATempoCostante(pulisci(condivisa), inviata)) {
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
