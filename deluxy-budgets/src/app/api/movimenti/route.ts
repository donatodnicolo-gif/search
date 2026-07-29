import { NextResponse } from "next/server";
import { fetchMovimenti } from "@/lib/finance";

// I movimenti di una controparte, per la pagina di dettaglio: si aprono su
// richiesta e non insieme al resto, perché caricarli per tutte le controparti
// vorrebbe dire una chiamata a Finance per ognuna — su una pagina che ne mostra
// centinaia.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const controparte = (searchParams.get("controparte") ?? "").trim();
  if (!controparte) return NextResponse.json({ error: "controparte mancante" }, { status: 400 });
  const anno = Number(searchParams.get("anno"));
  const dal = Number(searchParams.get("dal")) || 1;
  const al = Number(searchParams.get("al")) || 12;
  if (!Number.isFinite(anno) || anno < 2000) {
    return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  }
  const res = await fetchMovimenti({ anno, dal, al, controparte });
  if (!res.ok) return NextResponse.json({ error: res.errore }, { status: 502 });
  return NextResponse.json({ ok: true, movimenti: res.movimenti, totale: res.totale });
}
