import { NextRequest } from "next/server";
import { prisma } from "./db";

// Autenticazione delle API pubbliche per gli altri progetti Deluxy.
// Un'unica chiave (Impostazione "api.verificheKey") vale per tutti gli endpoint
// /api/verifiche e /api/fatture. Inviata in header X-API-Key o Authorization Bearer.

export async function chiaveApiValida(req: NextRequest): Promise<boolean> {
  const attesa = (await prisma.impostazione.findUnique({ where: { chiave: "api.verificheKey" } }))?.valore;
  if (!attesa) return false;
  const header = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === attesa || bearer === attesa;
}

export function appOrigine(req: NextRequest): string | null {
  return req.headers.get("x-app") || req.nextUrl.searchParams.get("origine") || null;
}

export function ipRichiesta(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
