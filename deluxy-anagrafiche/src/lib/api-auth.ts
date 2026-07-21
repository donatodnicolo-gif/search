import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./db";

// Autenticazione delle API: chiave nell'header "x-api-key" (o "Authorization: Bearer …").
// Nel database c'è solo lo SHA-256 della chiave. Le chiavi si creano con
// `npm run chiave -- <nome-app> [--scrittura]`.

export type ClientApi = {
  id: string;
  nome: string;
  scrittura: boolean;
  scritturaReferenti: boolean;
  scritturaPartner: boolean;
};

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
  opzioni: { scrittura?: boolean; referenti?: boolean; partner?: boolean } = {},
): Promise<ClientApi | NextResponse> {
  const chiave = estraiChiave(req);
  if (!chiave) {
    return erroreApi(401, "Chiave API mancante: header x-api-key o Authorization: Bearer");
  }
  const hash = createHash("sha256").update(chiave).digest("hex");
  const record = await prisma.apiKey.findUnique({ where: { hash } });
  if (!record || !record.attiva) return erroreApi(401, "Chiave API non valida");
  // Scrittura piena (PATCH/DELETE partner): solo chiavi `scrittura`.
  if (opzioni.scrittura && !record.scrittura) {
    return erroreApi(403, "Questa chiave è di sola lettura");
  }
  // Upsert partner (POST): chiave di scrittura piena O scope partner (POST-only).
  if (opzioni.partner && !record.scrittura && !record.scritturaPartner) {
    return erroreApi(403, "Questa chiave non può creare/aggiornare i partner");
  }
  // Archivio referenti: chiave di scrittura piena O scope referenti.
  if (opzioni.referenti && !record.scrittura && !record.scritturaReferenti) {
    return erroreApi(403, "Questa chiave non può scrivere sui referenti");
  }
  // Traccia l'ultimo uso senza bloccare la risposta
  prisma.apiKey
    .update({ where: { id: record.id }, data: { ultimoUso: new Date() } })
    .catch(() => {});
  return {
    id: record.id,
    nome: record.nome,
    scrittura: record.scrittura,
    scritturaReferenti: record.scritturaReferenti,
    scritturaPartner: record.scritturaPartner,
  };
}
