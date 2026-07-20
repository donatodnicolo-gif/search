import { NextRequest, NextResponse } from "next/server";
import { ficScambiaCodice, ficSelezionaAzienda } from "@/lib/fic";

// Ritorno dal consenso Fatture in Cloud: verifica lo state, scambia il codice
// con i token e memorizza l'azienda su cui operare.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const atteso = req.cookies.get("fic_state")?.value;

  const vai = (query: string) => {
    const res = NextResponse.redirect(new URL(`/impostazioni?${query}`, req.url));
    res.cookies.delete("fic_state");
    return res;
  };

  if (!code) return vai("errore=" + encodeURIComponent("Autorizzazione annullata o codice mancante."));
  if (!state || !atteso || state !== atteso) {
    return vai("errore=" + encodeURIComponent("Verifica di sicurezza fallita (state non valido): riprova a collegare."));
  }

  try {
    await ficScambiaCodice(code);
    const azienda = await ficSelezionaAzienda();
    return vai("salvato=fic&azienda=" + encodeURIComponent(azienda.name));
  } catch (e) {
    return vai("errore=" + encodeURIComponent((e as Error).message));
  }
}
