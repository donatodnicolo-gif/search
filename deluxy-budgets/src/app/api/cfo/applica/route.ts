import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TIPI = ["COGS", "ADV", "PERSONALE", "STRUTTURA", "ESCLUSA"];

// Applica in blocco un piano di categorie proposto dall'AL: crea le categorie
// (saltando quelle già esistenti per nome) e per ogni controparte una regola di
// match esatto verso la sua categoria. Idempotente: rilanciandolo non duplica.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const categorie = Array.isArray(body?.categorie) ? body.categorie : null;
  if (!categorie) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  let categorieCreate = 0;
  let regoleCreate = 0;
  let ordine = await prisma.categoriaCosto.count();

  for (const c of categorie) {
    const nome = String(c?.nome ?? "").trim();
    if (!nome) continue;
    const tipoPL = TIPI.includes(String(c?.tipoPL)) ? String(c.tipoPL) : "STRUTTURA";

    // Categoria: riusa quella con lo stesso nome, altrimenti creala.
    let cat = await prisma.categoriaCosto.findUnique({ where: { nome } });
    if (!cat) {
      cat = await prisma.categoriaCosto.create({ data: { nome, tipoPL, ordine: ordine++ } });
      categorieCreate++;
    }

    const controparti = Array.isArray(c?.controparti) ? c.controparti : [];
    for (const raw of controparti) {
      const match = String(raw ?? "").trim();
      if (!match) continue;
      // Evita regole duplicate identiche per la stessa categoria.
      const esiste = await prisma.regolaCosto.findFirst({
        where: { categoriaId: cat.id, match, esatto: true },
      });
      if (esiste) continue;
      await prisma.regolaCosto.create({ data: { match, esatto: true, categoriaId: cat.id } });
      regoleCreate++;
    }
  }

  return NextResponse.json({ ok: true, categorieCreate, regoleCreate });
}
