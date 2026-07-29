import { NextResponse } from "next/server";
import { fetchFatture } from "@/lib/finance";

// Le fatture di una tipologia, per il dettaglio dei ricavi: si aprono su
// richiesta, come i movimenti di banca — caricarle tutte insieme vorrebbe dire
// una chiamata a Finance per ogni riga della tabella.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tipologia = (searchParams.get("tipologia") ?? "").trim();
  if (!tipologia) return NextResponse.json({ error: "tipologia mancante" }, { status: 400 });
  const anno = Number(searchParams.get("anno"));
  const dal = Number(searchParams.get("dal")) || 1;
  const al = Number(searchParams.get("al")) || 12;
  if (!Number.isFinite(anno) || anno < 2000) {
    return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  }
  const res = await fetchFatture({ anno, dal, al, tipologia });
  if (!res.ok) return NextResponse.json({ error: res.errore }, { status: 502 });
  return NextResponse.json({ ok: true, fatture: res.fatture, totale: res.totale });
}
