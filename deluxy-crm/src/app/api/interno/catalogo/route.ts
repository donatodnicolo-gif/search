import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { collezioniMerch, prodottiMerch } from "@/lib/merchandising";

// Proxy per la UI: prodotti e collezioni di Merchandising cercati dal
// compositore dei messaggi. La chiave resta sul server; la sessione è
// controllata dal middleware (/api/interno/*) e qui con la revoca.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim();
  const cosa = p.get("cosa") === "collezioni" ? "collezioni" : "prodotti";
  if (q.length < 2) return NextResponse.json({ errore: "Scrivi almeno due lettere." }, { status: 400 });

  if (cosa === "collezioni") {
    const r = await collezioniMerch(q);
    if (!r.ok) return NextResponse.json({ errore: r.errore }, { status: 502 });
    return NextResponse.json(
      {
        voci: (r.dati.collezioni ?? []).map((c) => ({
          id: c.id,
          tipo: "collezione",
          nome: c.titolo,
          sotto: [c.negozio, c.prodotti != null ? `${c.prodotti} prodotti` : null].filter(Boolean).join(" · "),
          prezzo: null,
          immagine: null,
          testo: `${c.titolo} (${c.negozio})`,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const r = await prodottiMerch(q);
  if (!r.ok) return NextResponse.json({ errore: r.errore }, { status: 502 });
  return NextResponse.json(
    {
      voci: (r.dati.prodotti ?? []).map((pr) => {
        const negozi = [...new Set(pr.pubblicazioni.map((x) => x.negozio).filter(Boolean))];
        const prezzo = pr.prezzoVendita != null ? `${pr.prezzoVendita.toFixed(2).replace(".", ",")} €` : null;
        return {
          id: pr.id,
          tipo: "prodotto",
          nome: pr.nome,
          sotto: [pr.codice, negozi.join(", ")].filter(Boolean).join(" · "),
          prezzo,
          immagine: pr.immagine,
          // Il testo che finisce nel messaggio: nome e prezzo, più la nota di
          // specifica se c'è («20-25 fiori»). Niente link: l'indirizzo pubblico
          // del prodotto lo sa il negozio, non Merchandising.
          testo: [pr.nome, prezzo, pr.note].filter(Boolean).join(" — "),
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
