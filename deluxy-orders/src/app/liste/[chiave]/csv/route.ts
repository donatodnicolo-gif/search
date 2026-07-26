import { NextRequest, NextResponse } from "next/server";
import { elencoClienti } from "@/lib/clienti";
import { lista, nomeSegmento, nomeTipologia } from "@/lib/segmenti";

// Export CSV di una lista: è il ponte verso Google Customer Match, i pubblici
// Meta e chi deve telefonare. Massimo 20.000 righe per giro — oltre, una lista
// non si usa più a mano e conviene leggerla dalle API.
const MAX = 20000;

const COLONNE = [
  "nome", "email", "telefono", "citta", "ordini", "speso", "ordine_medio",
  "primo_ordine", "ultimo_ordine", "giorni_dall_ultimo", "brand", "segmento", "tipologia",
];

function cella(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Il punto e virgola separa (Excel italiano); le virgolette si raddoppiano.
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest, ctx: { params: Promise<{ chiave: string }> }) {
  const { chiave } = await ctx.params;
  const l = lista(chiave);
  if (!l) return NextResponse.json({ errore: "Lista sconosciuta" }, { status: 404 });

  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim() || undefined;
  // Gli stessi tagli della pagina: si esporta quello che si sta guardando.
  const taglio = { brand: p.get("brand")?.trim() || undefined, categoria: p.get("categoria")?.trim() || undefined };
  const clienti = await elencoClienti(q, "speso", 0, MAX, l.chiave, undefined, taglio);

  const righe = [
    COLONNE.join(";"),
    ...clienti.map((c) =>
      [
        c.nome, c.email, c.telefono, c.citta, c.ordini,
        c.speso.toFixed(2), c.medio.toFixed(2),
        iso(c.primoOrdine), iso(c.ultimoOrdine), c.giorni,
        c.brand.join(" "), nomeSegmento(c.segmento), nomeTipologia(c.tipologia),
      ].map(cella).join(";"),
    ),
  ];

  // BOM: senza, Excel su Windows sbaglia gli accenti dei nomi italiani.
  const corpo = "﻿" + righe.join("\r\n") + "\r\n";
  const oggi = new Date().toISOString().slice(0, 10);

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deluxy-clienti-${l.chiave}-${oggi}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
