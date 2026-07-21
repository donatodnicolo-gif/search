import { NextResponse } from "next/server";
import { studiaCategorie } from "@/lib/ai";

// L'AI studia le controparti bancarie e propone un piano di categorie di costo.
// Non scrive nulla: la proposta si conferma da /api/cfo/applica.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const controparti = Array.isArray(body?.controparti) ? body.controparti : null;
  const esistenti = Array.isArray(body?.esistenti) ? body.esistenti : [];
  if (!controparti) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  const lista = controparti
    .slice(0, 150)
    .map((c: Record<string, unknown>) => ({
      controparte: String(c?.controparte ?? "").slice(0, 120),
      uscite: Number(c?.uscite) || 0,
    }))
    .filter((c: { controparte: string }) => c.controparte);

  const cats = esistenti
    .map((c: Record<string, unknown>) => ({ nome: String(c?.nome ?? ""), tipoPL: String(c?.tipoPL ?? "") }))
    .filter((c: { nome: string }) => c.nome);

  const esito = await studiaCategorie(lista, cats);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.errore, configurata: esito.configurata }, { status: 200 });
  }
  return NextResponse.json({ ok: true, categorie: esito.categorie });
}
