import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decifra } from "@/lib/cifratura";

// Cassaforte centrale: le altre app Deluxy chiedono qui le proprie chiavi invece
// di tenerle nel .env. È un endpoint server-to-server, autenticato con un token
// di servizio (HUB_KEYS_TOKEN) — NON con la sessione utente.
//
//   GET /api/chiavi?progetto=deluxy-budgets            tutte le chiavi del progetto
//   GET /api/chiavi?progetto=deluxy-budgets&nome=OPENAI_API_KEY   una sola
//   Header: X-Hub-Token: <HUB_KEYS_TOKEN>
//
// Restituisce i valori IN CHIARO (decifrati): per questo l'auth a token è
// obbligatoria e il token va trattato come un segreto di primo livello.

function tokenValido(req: NextRequest): boolean {
  const atteso = (process.env.HUB_KEYS_TOKEN || "").trim();
  if (!atteso || atteso.length < 16) return false; // vault spento finché non configurato
  const dato =
    req.headers.get("x-hub-token")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return dato === atteso;
}

export async function GET(req: NextRequest) {
  if (!tokenValido(req)) {
    return NextResponse.json({ errore: "Token di servizio mancante o non valido (X-Hub-Token)." }, { status: 401 });
  }

  const progetto = req.nextUrl.searchParams.get("progetto")?.trim();
  const nome = req.nextUrl.searchParams.get("nome")?.trim();
  if (!progetto) {
    return NextResponse.json({ errore: "Parametro 'progetto' mancante." }, { status: 400 });
  }

  const where = nome ? { progetto, nome } : { progetto };
  const righe = await prisma.chiave.findMany({ where });

  const chiavi: Record<string, string> = {};
  for (const r of righe) {
    try {
      chiavi[r.nome] = decifra(r.valoreCifrato);
    } catch {
      // una chiave illeggibile (segreto di cifratura cambiato) non deve far
      // fallire tutte le altre: la si salta.
    }
  }

  // Nessun caching: i valori sono segreti e possono ruotare.
  return NextResponse.json(
    { progetto, chiavi },
    { headers: { "Cache-Control": "no-store" } }
  );
}
