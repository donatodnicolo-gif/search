import { NextResponse } from "next/server";
import { proponiRiconciliazioni } from "@/lib/ai";

// L'AI propone la categoria per un elenco di controparti. Non scrive nulla:
// restituisce solo le ipotesi, che l'utente conferma dalla UI (creando regole).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const controparti = Array.isArray(body?.controparti) ? body.controparti : null;
  const categorie = Array.isArray(body?.categorie) ? body.categorie : null;
  if (!controparti || !categorie) {
    return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  }

  // Tetto di sicurezza: non spedire migliaia di righe in un colpo solo.
  const lista = controparti
    .slice(0, 120)
    .map((c: Record<string, unknown>) => ({
      controparte: String(c?.controparte ?? "").slice(0, 120),
      uscite: Number(c?.uscite) || 0,
    }))
    .filter((c: { controparte: string }) => c.controparte);

  const cats = categorie
    .map((c: Record<string, unknown>) => ({ nome: String(c?.nome ?? ""), tipoPL: String(c?.tipoPL ?? "") }))
    .filter((c: { nome: string }) => c.nome);

  const esito = await proponiRiconciliazioni(lista, cats);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore, configurata: esito.configurata }, { status: 200 });
  }
  return NextResponse.json({ ok: true, proposte: esito.proposte });
}
