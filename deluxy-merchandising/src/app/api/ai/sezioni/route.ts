import { NextRequest, NextResponse } from "next/server";
import { riempiSezioni } from "@/lib/ai-sezioni";

// Il modulo prodotto è un componente client: chiede qui le sezioni compilate.
// Come per la descrizione, sta dietro il middleware col cookie di sessione.
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stringa = (k: string) => (typeof corpo[k] === "string" ? (corpo[k] as string) : "");
  const oggetto = (k: string) =>
    corpo[k] && typeof corpo[k] === "object" && !Array.isArray(corpo[k]) ? (corpo[k] as Record<string, string>) : {};

  const esito = await riempiSezioni({
    nome: stringa("nome"),
    categoria: stringa("categoria"),
    sito: stringa("sito"),
    materiali: stringa("materiali"),
    note: stringa("note"),
    prezzo: stringa("prezzo"),
    varianti: Array.isArray(corpo.varianti) ? (corpo.varianti as string[]) : [],
    descrizione: stringa("descrizione"),
    sezioni: Array.isArray(corpo.sezioni) ? (corpo.sezioni as { nome: string; tipo: string }[]) : [],
    gia: oggetto("gia"),
  });

  return NextResponse.json(esito, { status: esito.ok ? 200 : 422 });
}
