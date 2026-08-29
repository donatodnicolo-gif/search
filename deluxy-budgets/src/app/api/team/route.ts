import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const COLORI = ["green", "gold", "blue", "purple", "orange", "neutral"];

function normalizza(body: Record<string, unknown>) {
  // Ruolo economico (29/08/2026). Tre stati: struttura, ambiti, non dichiarato.
  // Gli ambiti si accettano come array di stringhe; il contenuto si valida in
  // POST/PUT contro le tipologie vere, perche' qui il database non c'e'.
  const struttura = body.struttura === true;
  const grezzi = Array.isArray(body.ambiti)
    ? body.ambiti.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  return {
    nome: String(body.nome ?? "").trim(),
    responsabile: body.responsabile ? String(body.responsabile).trim() : null,
    colore: COLORI.includes(String(body.colore)) ? String(body.colore) : "neutral",
    ordine: Number(body.ordine) || 0,
    note: body.note ? String(body.note).trim() : null,
    struttura,
    // Un team di struttura non porta ambiti: i due stati non convivono.
    ambiti: struttura || grezzi.length === 0 ? null : JSON.stringify(grezzi),
  };
}

// Gli ambiti validi sono le tipologie di servizio a database piu' il valore
// speciale del team commerciale. Un slug inventato non si salva: sommerebbe
// zero per sempre, e un ricavo a zero non distingue «ambito vuoto» da «ambito
// scritto male».
async function ambitiValidi(ambitiJson: string | null): Promise<string | null> {
  if (!ambitiJson) return null;
  const richiesti = JSON.parse(ambitiJson) as string[];
  const tipologie = await prisma.tipologiaServizio.findMany({ select: { slug: true } });
  const noti = new Set([...tipologie.map((t) => t.slug), "COMMERCIALE"]);
  const sconosciuti = richiesti.filter((s) => !noti.has(s));
  return sconosciuti.length ? sconosciuti.join(", ") : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  // Il nome è unico: un doppione va segnalato, non creato in silenzio.
  const esiste = await prisma.team.findUnique({ where: { nome: dati.nome } });
  if (esiste) return NextResponse.json({ error: "esiste già un team con questo nome" }, { status: 409 });

  const sconosciuti = await ambitiValidi(dati.ambiti);
  if (sconosciuti) return NextResponse.json({ error: `ambito sconosciuto: ${sconosciuti}` }, { status: 400 });

  const creato = await prisma.team.create({ data: dati });
  return NextResponse.json({ ok: true, id: creato.id });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id mancante" }, { status: 400 });
  }
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const omonimo = await prisma.team.findUnique({ where: { nome: dati.nome } });
  if (omonimo && omonimo.id !== body.id) {
    return NextResponse.json({ error: "esiste già un team con questo nome" }, { status: 409 });
  }

  const sconosciuti = await ambitiValidi(dati.ambiti);
  if (sconosciuti) return NextResponse.json({ error: `ambito sconosciuto: ${sconosciuti}` }, { status: 400 });

  await prisma.team.update({ where: { id: body.id }, data: dati });
  return NextResponse.json({ ok: true });
}

// Sciogliere un team non tocca le persone: restano a budget senza team
// (onDelete: SetNull nello schema).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.team.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
