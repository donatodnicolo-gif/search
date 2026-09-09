import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
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

/** L'impronta con cui una chiave si riconosce senza conservarla. */
export function improntaChiave(v: string): string {
  return createHash("sha256").update(v.trim()).digest("hex");
}

// ⭐ 09/09/2026 — UNA CHIAVE PER APPLICAZIONE.
//
// Prima c'era una chiave sola per scope: darne una nuova a un'app significava
// **rigenerare quella di tutti**, e le altre smettevano di entrare senza che
// niente lo dicesse. Una chiave condivisa non si può nemmeno revocare —
// togliendola a chi non deve più entrare la togli anche a chi deve.
//
// Ora ogni app ha la sua riga in `ChiaveApi`, con il suo scope e la sua revoca.
// Il confronto è per IMPRONTA: la chiave in chiaro non è da nessuna parte.
//
// ⚠️ Le chiavi vecchie continuano a valere. Spegnerle di colpo staccherebbe
// hub, mail, scout, orders e la piattaforma insieme — che è esattamente il
// guaio da cui si sta uscendo. Si migra un'app alla volta e si revocano alla
// fine, quando l'elenco dice che nessuno le usa più.
export async function chiaveApiValida(req: NextRequest, scope: ScopeApi = "lettura"): Promise<boolean> {
  const presentata = chiavePresentata(req);
  if (!presentata) return false;

  // 1) le chiavi per applicazione: ricerca per impronta, quindi una sola query
  //    indicizzata e nessun confronto stringa per stringa.
  const perApp = await prisma.chiaveApi.findUnique({ where: { impronta: improntaChiave(presentata) } });
  if (perApp && !perApp.revocataIl && perApp.scope === scope) {
    // Si annota l'ultimo uso, ma non a ogni richiesta: dieci minuti bastano a
    // sapere chi è vivo, e una scrittura per chiamata sarebbe un costo che non
    // serve a nessuno.
    const vecchio = !perApp.ultimoUsoIl || Date.now() - perApp.ultimoUsoIl.getTime() > 10 * 60 * 1000;
    if (vecchio) {
      await prisma.chiaveApi
        .update({ where: { id: perApp.id }, data: { ultimoUsoIl: new Date() } })
        .catch(() => null);
    }
    return true;
  }

  // 2) ripiego sulle chiavi storiche (unica + una per scope), finché ci sono.
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
