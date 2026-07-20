import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { whereRicerca } from "@/lib/ricerca";

// Ricerca anagrafiche per il popup di riconciliazione (protetta dal cookie
// di sessione della UI, vedi middleware). Restituisce anche hubspotId per
// segnalare i record già collegati.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ dati: [] });

  const dati = await prisma.partner.findMany({
    where: { attivo: true, AND: whereRicerca(q) },
    select: { id: true, nome: true, categoria: true, citta: true, stato: true, hubspotId: true },
    orderBy: { nome: "asc" },
    take: 10,
  });
  return NextResponse.json({ dati });
}
