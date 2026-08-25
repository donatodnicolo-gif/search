import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { interpretaRicerca, messaggioErroreAI, type FiltroRicerca } from "@/lib/ai";
import { serializzaAcquisto, serializzaRichiesta } from "@/lib/serializza";
import type { Prisma } from "@prisma/client";

// Ricerca in linguaggio naturale: l'AI trasforma la domanda in un filtro, poi
// lo applichiamo al database e restituiamo i record trovati (serializzati).
export async function POST(req: NextRequest) {
  let q = "";
  try {
    const body = await req.json();
    q = String(body?.q ?? "").trim();
  } catch {
    return NextResponse.json({ errore: "Corpo non valido." }, { status: 400 });
  }
  if (!q) return NextResponse.json({ errore: "Scrivi cosa cercare." }, { status: 400 });

  let filtro: FiltroRicerca;
  try {
    const oggi = new Date().toISOString().slice(0, 10);
    filtro = await interpretaRicerca(q, oggi);
  } catch (e) {
    return NextResponse.json({ errore: messaggioErroreAI(e) }, { status: 502 });
  }

  const dataDa = filtro.dataDa ? new Date(filtro.dataDa) : null;
  const dataA = filtro.dataA ? new Date(filtro.dataA) : null;

  if (filtro.ambito === "richieste") {
    const where: Prisma.RichiestaAcquistoWhereInput = { AND: [] as Prisma.RichiestaAcquistoWhereInput[] };
    const and = where.AND as Prisma.RichiestaAcquistoWhereInput[];
    if (filtro.categoria) and.push({ categoria: filtro.categoria });
    if (filtro.stato) and.push({ stato: filtro.stato });
    if (filtro.fornitore)
      and.push({ fornitoreSuggerito: { contains: filtro.fornitore, mode: "insensitive" } });
    if (dataDa || dataA) and.push({ creataIl: { gte: dataDa ?? undefined, lte: dataA ?? undefined } });
    if (filtro.testo) {
      const t = filtro.testo;
      and.push({
        OR: [
          { titolo: { contains: t, mode: "insensitive" } },
          { descrizione: { contains: t, mode: "insensitive" } },
          { fornitoreSuggerito: { contains: t, mode: "insensitive" } },
          { richiedenteNome: { contains: t, mode: "insensitive" } },
        ],
      });
    }
    const richieste = await prisma.richiestaAcquisto.findMany({
      where,
      orderBy: { creataIl: "desc" },
      take: 200,
    });
    return NextResponse.json({
      ambito: "richieste",
      spiegazione: filtro.spiegazione,
      richieste: richieste.map(serializzaRichiesta),
    });
  }

  // ambito "acquisti"
  const where: Prisma.AcquistoWhereInput = { AND: [] as Prisma.AcquistoWhereInput[] };
  const and = where.AND as Prisma.AcquistoWhereInput[];
  if (filtro.categoria) and.push({ categoria: filtro.categoria });
  if (filtro.stato) and.push({ stato: filtro.stato });
  if (filtro.soloDaPagare) and.push({ stato: { in: ["ordinato", "ricevuto", "pagato_parziale"] } });
  if (filtro.fornitore) and.push({ fornitoreNome: { contains: filtro.fornitore, mode: "insensitive" } });
  if (filtro.importoMin != null) and.push({ totale: { gte: filtro.importoMin } });
  if (filtro.importoMax != null) and.push({ totale: { lte: filtro.importoMax } });
  if (dataDa || dataA) and.push({ dataOrdine: { gte: dataDa ?? undefined, lte: dataA ?? undefined } });
  if (filtro.testo) {
    const t = filtro.testo;
    and.push({
      OR: [
        { descrizione: { contains: t, mode: "insensitive" } },
        { fornitoreNome: { contains: t, mode: "insensitive" } },
        { numeroFattura: { contains: t, mode: "insensitive" } },
        { note: { contains: t, mode: "insensitive" } },
      ],
    });
  }
  const acquisti = await prisma.acquisto.findMany({
    where,
    include: { movimenti: true },
    orderBy: { dataOrdine: "desc" },
    take: 200,
  });
  return NextResponse.json({
    ambito: "acquisti",
    spiegazione: filtro.spiegazione,
    acquisti: acquisti.map(serializzaAcquisto),
  });
}
