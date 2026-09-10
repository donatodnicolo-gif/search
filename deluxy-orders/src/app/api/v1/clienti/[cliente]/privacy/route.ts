import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { codificaChiave, decodificaChiave } from "@/lib/clienti";
import { prisma } from "@/lib/db";

// POST /api/v1/clienti/{cliente}/privacy — i consensi del cliente, scritti
// da un'altra app (il CRM, 10/09/2026): email / sms / telefono come "si" o
// "no", `bloccato` per «non contattare più». Casa unica (standard §7): la
// tabella PrivacyCliente vive qui, le altre app la leggono dalla scheda e la
// cambiano solo passando da questa rotta, con chiave di scrittura.
//
// Corpo: { email?: "si"|"no"|null, sms?: …, telefono?: …, bloccato?: boolean,
//          note?: string, autore?: string }
// Manca un campo = non si tocca.
export async function POST(req: NextRequest, ctx: { params: Promise<{ cliente: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  const { cliente: codice } = await ctx.params;
  const chiave = codice.includes("@") ? decodeURIComponent(codice).trim().toLowerCase() : decodificaChiave(codice);
  if (!chiave) return erroreApi(400, "Cliente non riconoscibile");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo non valido: serve un JSON");
  }

  const scelta = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return v === "si" || v === "no" ? v : undefined;
  };
  const dati: { email?: string | null; sms?: string | null; telefono?: string | null; bloccato?: boolean; note?: string | null; autore: string } = {
    autore: typeof body.autore === "string" && body.autore ? `${client.nome}: ${body.autore}` : client.nome,
  };
  for (const k of ["email", "sms", "telefono"] as const) {
    const v = scelta(body[k]);
    if (v !== undefined) dati[k] = v;
  }
  if (typeof body.bloccato === "boolean") dati.bloccato = body.bloccato;
  if (typeof body.note === "string") dati.note = body.note.slice(0, 500) || null;

  const riga = await prisma.privacyCliente.upsert({
    where: { chiave },
    create: { chiave, ...dati },
    update: dati,
  });
  return NextResponse.json({
    ok: true,
    cliente: codificaChiave(chiave),
    privacy: { email: riga.email, sms: riga.sms, telefono: riga.telefono, bloccato: riga.bloccato, note: riga.note },
  });
}
