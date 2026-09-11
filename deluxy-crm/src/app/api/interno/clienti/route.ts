import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { elencoClienti } from "@/lib/orders";

// Ricerca viva dei clienti per il «Nuovo ordine» (e per chi cerca una
// persona da un campo): pochi risultati, dal registro di Orders.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ clienti: [] });
  const r = await elencoClienti({ q, limit: 8 });
  if (!r.ok) return NextResponse.json({ errore: r.errore }, { status: 502 });
  return NextResponse.json(
    {
      clienti: r.dati.clienti.map((c) => ({
        cliente: c.cliente,
        nome: c.nome ?? c.email ?? c.telefono ?? "—",
        sotto: [c.email ?? c.telefono, c.citta, `${c.ordini} ordini`].filter(Boolean).join(" · "),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
