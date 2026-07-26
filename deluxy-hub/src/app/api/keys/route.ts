import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// ============================================================
// Cassaforte chiavi centrale dell'Hub.
// ------------------------------------------------------------
// Le app dell'ecosistema leggono le proprie chiavi API da qui invece di
// tenerle in ogni progetto: così la chiave vive in UN solo posto (l'env
// dell'Hub) e si ruota una volta sola.
//
//   GET /api/keys?name=anagrafiche
//   Header: Authorization: Bearer <HUB_KEYS_TOKEN>   (oppure x-hub-token)
//   → 200 { name, value }   (value = la chiave richiesta)
//   → 401 token non valido · 404 chiave non configurata
//
// Convenzione: il valore di `name` si legge dalla env `HUBKEY_<NOME>`
// (es. name=anagrafiche → HUBKEY_ANAGRAFICHE). Server-to-server: mai dal
// browser, mai in cache (Cache-Control: no-store).
// ============================================================

/** Confronto a tempo costante (evita timing attack sul token). */
function tokenUguale(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function GET(req: NextRequest) {
  const atteso = process.env.HUB_KEYS_TOKEN;
  if (!atteso) {
    return NextResponse.json({ error: "Cassaforte non configurata (HUB_KEYS_TOKEN mancante)" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const fornito = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-hub-token") ?? "";
  if (!fornito || !tokenUguale(fornito, atteso)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 401 });
  }

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(name)) {
    return NextResponse.json({ error: "Parametro 'name' non valido" }, { status: 400 });
  }

  const envName = `HUBKEY_${name.toUpperCase().replace(/-/g, "_")}`;
  const value = process.env[envName];
  if (!value) {
    return NextResponse.json({ error: `Chiave '${name}' non configurata sull'Hub` }, { status: 404 });
  }

  return NextResponse.json(
    { name, value },
    { headers: { "Cache-Control": "no-store" } },
  );
}
