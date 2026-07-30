import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { nomeCompleto } from "@/lib/valet";

// GET /api/v1/valet/:id — un valet, per id del registro **o** per `platformId`
// (l'id che ha nella piattaforma consegne): le app che lo conoscono da lì non
// devono tenere una tabella di traduzione.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { id } = await ctx.params;
  const v =
    (await prisma.valet.findUnique({ where: { id } })) ??
    (await prisma.valet.findUnique({ where: { platformId: id } }));
  if (!v) return erroreApi(404, "Valet non trovato");

  return NextResponse.json({
    id: v.id,
    nome: v.nome,
    cognome: v.cognome,
    nomeCompleto: nomeCompleto(v),
    telefono: v.telefono,
    email: v.email,
    indirizzo: v.indirizzo,
    citta: v.citta,
    provincia: v.provincia,
    provinceServite: v.provinceServite
      ? v.provinceServite.split(",").map((p) => p.trim()).filter(Boolean)
      : [],
    mezzo: v.mezzo,
    codiceFiscale: v.codiceFiscale,
    pIva: v.pIva,
    stato: v.stato,
    note: v.note,
    platformId: v.platformId,
    fonte: v.fonte,
    attivo: v.attivo,
    creatoIl: v.creatoIl,
    aggiornatoIl: v.aggiornatoIl,
  });
}
