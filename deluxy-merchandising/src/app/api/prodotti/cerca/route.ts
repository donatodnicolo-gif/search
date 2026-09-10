// **Cerca un prodotto del catalogo per nome o SKU** — per la sezione
// «Multiprodotto» del modulo (10/09/2026, richiesta dell'utente: «una sezione
// opzionale che lo aggancia ad altri prodotti esistenti»).
//
// Sola lettura, pochi campi, venti risultati: è una tendina, non un elenco.
// Gli attivi sul negozio vengono prima; le schede unite a un'altra
// (`unitoAId`) non compaiono, perché quel prodotto ora è l'altro. Come le altre
// rotte del modulo sta dietro il middleware col cookie di sessione.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const escludi = (url.searchParams.get("escludi") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, prodotti: [] });

  const prodotti = await prisma.prodotto.findMany({
    where: {
      unitoAId: null,
      ...(escludi ? { id: { not: escludi } } : {}),
      OR: [{ nome: { contains: q, mode: "insensitive" } }, { codice: { contains: q, mode: "insensitive" } }],
    },
    orderBy: [{ statoShopify: "asc" }, { nome: "asc" }],
    take: 20,
    select: { id: true, nome: true, codice: true, prezzoVendita: true, costoProduzione: true, categoria: true, statoShopify: true, negozioNome: true },
  });
  return NextResponse.json({ ok: true, prodotti });
}
