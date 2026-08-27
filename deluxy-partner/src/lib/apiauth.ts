import { NextRequest } from "next/server";
import { prisma } from "./db";
import { segretoCombacia } from "./confronto";

// Autenticazione delle API per gli altri progetti Deluxy.
//
// ⚠️ STORIA: fino al 27/08/2026 esisteva UNA sola chiave (Impostazione
// "api.verificheKey") e valeva per tutto — la stessa stringa che serviva a
// un'app per «verificare un partner» leggeva anche l'estratto conto bancario
// completo e scriveva pro-forma, task e anagrafiche. Chi la otteneva da una
// qualunque app aveva in mano l'intero libro contabile.
//
// Ora ogni rotta dichiara il suo SCOPE e le chiavi sono separate:
//   lettura    — dati anagrafici e contabili di sintesi (fatture, incassi,
//                stato del credito, riepiloghi, tipologie, vendor, ordini)
//   banca      — estratto conto e uscite con causali e controparti
//   scrittura  — creazione/modifica (pro-forma, task, partner)
//
// La MIGRAZIONE è additiva apposta: la vecchia chiave unica continua a valere
// per TUTTI gli scope, altrimenti spegnerla romperebbe hub, mail, scout,
// orders e la piattaforma in un colpo solo. Si generano le chiavi a scope in
// /verifiche, si migra un'app alla volta, e solo alla fine si rigenera (o si
// cancella) `api.verificheKey`.
export type ScopeApi = "lettura" | "banca" | "scrittura";

export const CHIAVE_LEGACY = "api.verificheKey";

export const CHIAVE_PER_SCOPE: Record<ScopeApi, string> = {
  lettura: "api.key.lettura",
  banca: "api.key.banca",
  scrittura: "api.key.scrittura",
};

export function chiavePresentata(req: NextRequest): string | null {
  const header = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const v = (header || bearer || "").trim();
  return v.length > 0 ? v : null;
}

// `scope` è il permesso che la rotta richiede. Vale la chiave di QUELLO scope
// oppure la vecchia chiave unica finché esiste.
export async function chiaveApiValida(req: NextRequest, scope: ScopeApi = "lettura"): Promise<boolean> {
  const presentata = chiavePresentata(req);
  if (!presentata) return false;
  const ammesse = [CHIAVE_LEGACY, CHIAVE_PER_SCOPE[scope]];
  const righe = await prisma.impostazione.findMany({ where: { chiave: { in: ammesse } } });
  // Nessun return anticipato al primo confronto: si valutano tutte, così il
  // tempo di risposta non dice QUALE chiave era quella giusta.
  let ok = false;
  for (const r of righe) {
    if (segretoCombacia(presentata, r.valore)) ok = true;
  }
  return ok;
}

export function appOrigine(req: NextRequest): string | null {
  return req.headers.get("x-app") || req.nextUrl.searchParams.get("origine") || null;
}

export function ipRichiesta(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
