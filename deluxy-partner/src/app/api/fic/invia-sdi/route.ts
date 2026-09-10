import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { inviaFatturaAlloSdi } from "@/lib/fic-sdi";

// INVIA ALLO SDI dal pop-up della fattura (10/09/2026).
//
//   POST /api/fic/invia-sdi   { numero: "648/2026", anno: 2026, fatturaId?: "…" }
//
// Rotta INTERNA come /api/fic/documento: sta dietro la sessione (non è nelle
// esclusioni del middleware), non ha chiave API e non va data alle altre app.
// L'atto è irreversibile: la conferma la chiede il bottone, qui si rilegge lo
// stato su FIC prima di partire (vedi fic-sdi.ts) e si scrive nel registro.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { numero?: unknown; anno?: unknown; fatturaId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }
  const numero = String(body.numero ?? "").trim();
  const anno = Number.isInteger(Number(body.anno)) && Number(body.anno) > 2000 ? Number(body.anno) : undefined;
  const fatturaId = typeof body.fatturaId === "string" && body.fatturaId ? body.fatturaId : null;
  if (!numero) return NextResponse.json({ errore: "Parametro 'numero' obbligatorio." }, { status: 400 });

  const riga = fatturaId
    ? await prisma.fatturaServizio.findUnique({ where: { id: fatturaId }, select: { partner: { select: { nome: true } } } })
    : null;
  const esito = await inviaFatturaAlloSdi(numero, anno, { fatturaId, partner: riga?.partner.nome ?? null, da: "pop-up della fattura" });
  if (esito.ok) {
    for (const pth of ["/fatture", "/partner", "/registrazioni/fatture"]) revalidatePath(pth, "layout");
    return NextResponse.json({ ok: true, prima: esito.prima, dopo: esito.dopo });
  }
  return NextResponse.json({ ok: false, errore: esito.errore, stato: esito.stato ?? null }, { status: 409 });
}
