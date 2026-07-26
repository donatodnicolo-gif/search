import { NextRequest, NextResponse } from "next/server";
import { generaDescrizione } from "@/lib/ai-descrizione";

// Il form del prodotto è un componente client: chiede la descrizione qui.
// La rotta sta dietro il middleware come tutto il resto (cookie di sessione),
// quindi non è un ingresso aperto sull'app.
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stringa = (k: string) => (typeof corpo[k] === "string" ? (corpo[k] as string) : "");

  const esito = await generaDescrizione({
    nome: stringa("nome"),
    categoria: stringa("categoria"),
    tipo: stringa("tipo"),
    materiali: stringa("materiali"),
    prezzo: stringa("prezzo"),
    varianti: Array.isArray(corpo.varianti) ? (corpo.varianti as string[]) : [],
    tono: stringa("tono") || "maison",
  });

  return NextResponse.json(esito, { status: esito.ok ? 200 : 422 });
}
