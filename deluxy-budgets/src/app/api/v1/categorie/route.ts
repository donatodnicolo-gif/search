import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiave } from "@/lib/chiavi";

// GET /api/v1/categorie — le CATEGORIE DI COSTO per le altre app Deluxy.
//
// Perché sta qui e non altrove: le categorie di costo decidono dove finisce una
// spesa nel conto economico (COGS, ADV, personale, struttura), quindi sono di
// questa app, che è quella che fa il bilancio. Le altre app — Finance in testa,
// che ha i movimenti di banca — le LEGGONO da qui e non se ne tengono una copia
// propria: due elenchi di categorie che divergono darebbero due bilanci.
//
// Auth: header `X-API-Key` con la chiave `BUDGETS_API_KEY` (env, o Configurazione
// → Chiavi, o cassaforte del Hub — nell'ordine deciso da `chiave()`).
// Sola lettura: creare o modificare una categoria si fa dentro Budgets.
//
// Parametri:
//   ?regole=1  aggiunge a ogni categoria le regole di riclassificazione
//              (`match` sulla controparte), così chi consuma può spiegare
//              PERCHÉ una spesa è finita lì invece di limitarsi a subirlo.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const attesa = await chiave("BUDGETS_API_KEY");
  if (!attesa) {
    return NextResponse.json(
      { errore: "BUDGETS_API_KEY non configurata su questa app: l'API è disattivata." },
      { status: 503 }
    );
  }
  // Ripulita dai caratteri invisibili: un BOM incollato nell'header fa fallire
  // la richiesta con un errore che non nomina nemmeno la chiave.
  const inviata = (req.headers.get("x-api-key") ?? "").replace(new RegExp("[\u200B-\u200D\uFEFF\u00A0]", "g"), "").trim();
  if (!inviata || inviata !== attesa.trim()) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const conRegole = req.nextUrl.searchParams.get("regole") === "1";
  const categorie = await prisma.categoriaCosto.findMany({
    orderBy: { ordine: "asc" },
    include: conRegole ? { regole: true } : undefined,
  });

  return NextResponse.json({
    // `tipoPL` è dove la categoria confluisce nel conto economico. «ESCLUSA»
    // NON vuol dire «spesa da ignorare»: vuol dire che non è un costo di
    // gestione (banca, tasse) e resta fuori dal margine.
    tipiPL: ["COGS", "ADV", "PERSONALE", "STRUTTURA", "ESCLUSA"],
    // `voceCE` è la stessa categoria vista dal **bilancio civilistico**. Non
    // sostituisce `tipoPL`: le due rispondono a domande diverse e divergono
    // parecchio — in bilancio la pubblicità sta dentro B7 «servizi» e non è una
    // voce sua, e B9 «personale» è solo lavoro dipendente. `null` = nessuno
    // l'ha ancora decisa.
    vociCE: ["B6", "B7", "B8", "B9", "B14", "C17", "ESCLUSA"],
    categorie: categorie.map((c) => ({
      id: c.id,
      nome: c.nome,
      tipoPL: c.tipoPL,
      voceCE: c.voceCE,
      colore: c.colore,
      ordine: c.ordine,
      ...(conRegole && "regole" in c
        ? { regole: (c.regole as { match: string; esatto: boolean }[]).map((r) => ({ match: r.match, esatto: r.esatto })) }
        : {}),
    })),
  });
}
