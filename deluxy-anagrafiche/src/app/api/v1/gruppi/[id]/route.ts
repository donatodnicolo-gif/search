import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { leggiGruppo } from "@/lib/soggetto-fiscale";

// GET /api/v1/gruppi/:id — l'entità con dentro tutto ciò che serve a sommare.
//
// È la risposta alla domanda «quanto fattura questa entità con noi in tutte le
// sue società»: qui ci sono le SOCIETÀ (con la P.IVA, che è l'identità fiscale)
// e per ognuna i NEGOZI con l'id del registro — cioè le due chiavi con cui
// FINANCE riconosce le proprie schede (`anagraficaId` e `AnagraficaCollegata`).
//
// ⚠️ Gli importi NON stanno qui. Chi li ha è FINANCE, che è il custode dei
// risultati: somma le sue schede e risponde. Ricopiare un fatturato nel
// registro vorrebbe dire tenerlo aggiornato per sempre, e il giorno che smette
// nessuno se ne accorge — il numero continua a tornare, ed è vecchio.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { id } = await ctx.params;
  const g = await leggiGruppo(id);
  if (!g) return erroreApi(404, "Gruppo non trovato");

  return NextResponse.json({
    id: g.id,
    nome: g.nome,
    note: g.note,
    societa: g.societa.map((s) => ({
      id: s.id,
      ragioneSociale: s.ragioneSociale,
      pIva: s.pIva,
      codiceFiscale: s.codiceFiscale,
      // I negozi che questa società fattura: `id` è l'id del registro, la
      // chiave con cui le altre app agganciano le proprie schede.
      sedi: s.sedi.map((p) => ({
        id: p.id,
        nome: p.nome,
        citta: p.citta,
        sede: p.sede,
        stato: p.stato,
      })),
    })),
    // Comodità per chi deve solo sommare: tutte le anagrafiche dell'entità,
    // senza dover appiattire la struttura qui sopra.
    anagraficheIds: g.societa.flatMap((s) => s.sedi.map((p) => p.id)),
  });
}
