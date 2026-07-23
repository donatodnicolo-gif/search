import { NextRequest, NextResponse } from "next/server";
import { decifra } from "@/lib/cifratura";
import { prisma } from "@/lib/db";
import { autenticaToken, erroreApi } from "@/lib/token-api";

// GET /api/chiavi?progetto=<id>[&nome=<NOME>]
// Lettura delle chiavi di un progetto per le altre app Deluxy. Autenticazione
// via token di servizio (header x-api-key o Authorization: Bearer), generato
// dalla pagina /chiavi e limitato ai suoi progetti. Risposta:
//   { "progetto": "deluxy-scout", "chiavi": { "OPENAI_API_KEY": "sk-…", … } }
// I valori vengono decifrati al volo; nessuna cache (Cache-Control: no-store).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticaToken(req);
  if (auth instanceof NextResponse) return auth; // 401

  const progetto = req.nextUrl.searchParams.get("progetto");
  if (!progetto) return erroreApi(400, "Parametro 'progetto' mancante");

  // Scope del token: progetti vuoto = tutti; altrimenti solo i suoi.
  if (auth.progetti.length > 0 && !auth.progetti.includes(progetto)) {
    return erroreApi(403, `Questo token non può leggere il progetto '${progetto}'`);
  }

  const nome = req.nextUrl.searchParams.get("nome");
  const righe = await prisma.chiave.findMany({
    where: nome ? { progetto, nome } : { progetto },
  });

  const chiavi: Record<string, string> = {};
  for (const c of righe) {
    try {
      chiavi[c.nome] = decifra(c.valoreCifrato);
    } catch {
      // Chiave illeggibile (segreto di cifratura cambiato): la saltiamo.
    }
  }

  return NextResponse.json(
    { progetto, chiavi },
    { headers: { "Cache-Control": "no-store" } }
  );
}
