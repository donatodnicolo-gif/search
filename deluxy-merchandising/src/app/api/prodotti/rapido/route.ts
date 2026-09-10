// **Un componente creato al volo** dalla sezione «Multiprodotto» del modulo
// (10/09/2026, richiesta dell'utente: «altri prodotti esistenti o che si
// possono creare velocemente»).
//
// ⚠️ **Crea un prodotto vero**, in fase «concept», che si vede nell'elenco
// come tutti gli altri e si può poi completare col modulo: un componente non è
// una riga di testo dentro il cesto, è un prodotto del catalogo — così il suo
// costo vale per tutti i composti che lo usano e cambia in un posto solo.
// Per questo qui si chiede il minimo che rende il prodotto utile come pezzo:
// nome, categoria, prezzo e costo. SKU a sette cifre, come i nuovi del modulo.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const codiceCasuale = () => String(Math.floor(1_000_000 + Math.random() * 9_000_000));
const soldi = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { nome?: string; categoria?: string; prezzoVendita?: unknown; costoProduzione?: unknown; perNome?: string } | null;
  if (!corpo) return NextResponse.json({ ok: false, errore: "Richiesta illeggibile." }, { status: 400 });

  const nome = (corpo.nome ?? "").trim().slice(0, 300);
  if (nome.length < 3) return NextResponse.json({ ok: false, errore: "Il nome del componente ha almeno tre lettere." }, { status: 400 });
  const chiesta = (corpo.categoria ?? "").trim();
  const categoria = chiesta && (await prisma.categoriaProdotto.findUnique({ where: { chiave: chiesta }, select: { chiave: true } })) ? chiesta : "DA_CLASSIFICARE";

  let codice = codiceCasuale();
  for (let i = 0; i < 20; i++) {
    const preso = (await prisma.prodotto.findUnique({ where: { codice }, select: { id: true } })) || (await prisma.variante.findUnique({ where: { sku: codice }, select: { id: true } }));
    if (!preso) break;
    codice = codiceCasuale();
  }

  const perNome = (corpo.perNome ?? "").trim().slice(0, 300);
  const p = await prisma.prodotto.create({
    data: {
      nome,
      codice,
      categoria,
      fase: "concept",
      prezzoVendita: soldi(corpo.prezzoVendita),
      costoProduzione: soldi(corpo.costoProduzione),
      tappe: { create: { da: "—", a: "concept", nota: `Creato al volo come componente${perNome ? ` di «${perNome}»` : ""}: da completare col modulo.`, origine: "ui" } },
    },
    select: { id: true, nome: true, codice: true, prezzoVendita: true, costoProduzione: true, categoria: true, statoShopify: true, negozioNome: true },
  });
  return NextResponse.json({ ok: true, prodotto: p });
}
