import { NextRequest, NextResponse } from "next/server";
import { autenticaToken, erroreApi } from "@/lib/token-api";
import { rapportoPresenze, riepilogoMese } from "@/lib/presenze";

// GET /api/presenze?mese=YYYY-MM[&nota=…] — il cartellino del mese per le
// altre app Deluxy (in testa deluxy-personale, che da lì manda il rapporto al
// commercialista per le buste paga). Il Hub resta il proprietario di
// timbrature e assenze: qui si LEGGE, e i numeri sono ESATTAMENTE quelli
// della schermata di gestione e dell'email del Cartellino, perché escono
// dalla stessa funzione (riepilogoMese + rapportoPresenze) — due conti
// separati prima o poi direbbero numeri diversi.
//
// Auth: token di servizio (x-api-key / Bearer), come /api/chiavi. Se il token
// è limitato a certi progetti, deve comprendere «personale»: sono presenze
// del personale, non chiavi qualsiasi.
//
// Risposta: { riepilogo, rapporto: { oggetto, testo, html } } — il rapporto è
// già pronto da spedire, con l'eventuale `nota` in testa.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticaToken(req);
  if (auth instanceof NextResponse) return auth; // 401

  if (auth.progetti.length > 0 && !auth.progetti.includes("personale")) {
    return erroreApi(403, "Questo token non può leggere le presenze (serve lo scope 'personale')");
  }

  const mese = req.nextUrl.searchParams.get("mese") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mese)) {
    return erroreApi(400, "Parametro 'mese' mancante o non valido (formato YYYY-MM)");
  }

  let riepilogo;
  try {
    riepilogo = await riepilogoMese(mese);
  } catch (errore) {
    return erroreApi(400, errore instanceof Error ? errore.message : "Mese non leggibile");
  }

  const nota = req.nextUrl.searchParams.get("nota") ?? undefined;
  const rapporto = rapportoPresenze(riepilogo, { nota, daNome: "Deluxy Personale" });

  return NextResponse.json(
    { riepilogo, rapporto },
    { headers: { "Cache-Control": "no-store" } },
  );
}
