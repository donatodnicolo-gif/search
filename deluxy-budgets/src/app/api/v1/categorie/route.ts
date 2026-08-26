import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { autentica } from "@/lib/api-auth";

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
  // ⚠️ **Questa rotta si riscriveva l'auth a mano** (difetto trovato e chiuso
  // il 27/08/2026): confrontava solo `BUDGETS_API_KEY` e ignorava le chiavi
  // emesse da Configurazione → Chiavi. Conseguenza: una chiave emessa e valida
  // prendeva **401 qui** e 200 su `maison`, `team` e `categorie/proponi`; la
  // **revoca non revocava** e l'`ultimoUso` non si aggiornava. Non era una
  // scelta: la rotta è del 31/07, `api-auth.ts` del 24/08, e nessuno l'ha
  // migrata. ⭐ È esattamente il guaio per cui `autentica()` sta in un file
  // solo — *una rotta che si riscrive l'auth è una rotta che prima o poi
  // dimentica un pezzo* — e questa se n'era dimenticata due.
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

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
      // **Cosa ci va dentro e cosa no** (31/07/2026). Chi assegna una spesa a
      // mano lo fa quasi sempre in Finance, davanti al movimento — cioè
      // nell'unico posto dove questa riga non arrivava. Il nome da solo fa
      // indovinare, e indovinare vuol dire mettere la stessa spesa oggi in una
      // categoria e domani in un'altra.
      descrizione: c.descrizione,
      // **Questa categoria non è un costo: è denaro dei partner** (modello C).
      // È il campo che cambia di più la lettura di un movimento — un bonifico a
      // un fioraio non è una spesa, è la sua quota — e Finance non ce l'aveva.
      quotaPartner: c.quotaPartner,
      colore: c.colore,
      ordine: c.ordine,
      ...(conRegole && "regole" in c
        ? { regole: (c.regole as { match: string; esatto: boolean }[]).map((r) => ({ match: r.match, esatto: r.esatto })) }
        : {}),
    })),
  });
}
