import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";

// Autenticazione dell'API di lettura chiavi (GET /api/chiavi). Il token arriva
// nell'header "x-api-key" o "Authorization: Bearer …". Sul database c'è solo lo
// SHA-256: cerchiamo per hash, così non confrontiamo mai il token in chiaro.

export function erroreApi(status: number, messaggio: string) {
  return NextResponse.json({ errore: messaggio }, { status });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function estraiToken(req: NextRequest): string | null {
  const diretta = req.headers.get("x-api-key");
  if (diretta) return diretta.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export type TokenApi = {
  id: string;
  nome: string;
  progetti: string[];
};

// Restituisce il token autenticato oppure una NextResponse di errore già pronta.
export async function autenticaToken(req: NextRequest): Promise<TokenApi | NextResponse> {
  const token = estraiToken(req);
  if (!token) {
    return erroreApi(401, "Token mancante: header x-api-key o Authorization: Bearer");
  }
  const record = await prisma.tokenApi.findUnique({ where: { hash: hashToken(token) } });
  if (!record || !record.attivo) return erroreApi(401, "Token non valido");

  // Traccia l'ultimo uso senza bloccare la risposta.
  prisma.tokenApi.update({ where: { id: record.id }, data: { ultimoUso: new Date() } }).catch(() => {});

  return { id: record.id, nome: record.nome, progetti: record.progetti };
}
