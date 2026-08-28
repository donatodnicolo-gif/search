import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { operatoreCorrente } from "@/lib/sessione";
import { intestazioniDownload } from "@/lib/allegati";

// GET /api/allegati/<id> — download di un allegato per gli operatori (UI).
// Stesse difese della via firmata: whitelist, attachment, nosniff, no-store.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const operatore = await operatoreCorrente();
  if (!operatore) return NextResponse.json({ errore: "Serve l'accesso." }, { status: 401 });
  const { id } = await ctx.params;

  const allegato = await prisma.allegato.findUnique({ where: { id }, include: { dati: true } });
  if (!allegato?.dati) return NextResponse.json({ errore: "Allegato inesistente." }, { status: 404 });

  const buffer = Buffer.from(allegato.dati.dati, "base64");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...intestazioniDownload(allegato),
      "Content-Length": String(buffer.length),
      "x-allegato-sha256": allegato.sha256,
    },
  });
}
