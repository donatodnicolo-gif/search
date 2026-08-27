import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";

// Autenticazione delle API /api/v1: chiave nell'header "x-api-key" (o
// "Authorization: Bearer …"). Nel database c'è solo lo SHA-256 della chiave.
// Le chiavi si creano con `npm run chiave -- <nome> [--sola-lettura]`.

export type ClientApi = { id: string; nome: string; scrittura: boolean };

export function erroreApi(status: number, messaggio: string) {
  return NextResponse.json({ errore: messaggio }, { status });
}

function estraiChiave(req: NextRequest): string | null {
  const diretta = req.headers.get("x-api-key");
  if (diretta) return diretta.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function autentica(
  req: NextRequest,
  opzioni: { scrittura?: boolean } = {},
): Promise<ClientApi | NextResponse> {
  const chiave = estraiChiave(req);
  if (!chiave) {
    return erroreApi(401, "Chiave API mancante: header x-api-key o Authorization: Bearer");
  }
  const hash = createHash("sha256").update(chiave).digest("hex");
  const record = await prisma.apiKey.findUnique({ where: { hash } });
  if (!record || !record.attiva) return erroreApi(401, "Chiave API non valida");
  if (opzioni.scrittura && !record.scrittura) {
    return erroreApi(403, "Questa chiave è di sola lettura");
  }
  // Traccia l'ultimo uso senza bloccare la risposta
  prisma.apiKey
    .update({ where: { id: record.id }, data: { ultimoUso: new Date() } })
    .catch(() => {});
  return { id: record.id, nome: record.nome, scrittura: record.scrittura };
}

/**
 * Il «limite» chiesto da chi chiama, ridotto a un numero sensato.
 *
 * ⚠️ Sta qui e non nelle quattro rotte che lo usano: quattro copie della
 * stessa regola divergono, ed e' gia' successo in questo repo con la lettura
 * degli importi. Prima ogni rotta faceva `Number(p.get("limite") ?? 200)`, e
 * `limite=abc` diventava `NaN`: Prisma lo rifiutava con un 500 al posto di un
 * 400 — non un buco di sicurezza (la richiesta muore prima di prendere una
 * connessione), ma una scortesia verso chi integra.
 *
 * ⚠️ Il tetto NON e' una difesa: chi ha una chiave ottiene le stesse righe
 * chiamando piu' volte. Serve a non far partire per sbaglio una query che
 * tiene occupata una delle cinque connessioni del pool condiviso.
 */
export function limiteRichiesto(valore: string | null, predefinito: number): number | null {
  if (valore == null || valore === "") return predefinito;
  const n = Number(valore);
  if (!Number.isFinite(n)) return null; // chi chiama merita un 400, non un 500
  return Math.min(Math.max(1, Math.floor(n)), 5000);
}
