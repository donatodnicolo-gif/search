import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Dal 06/09/2026 le persone ARRIVANO DA PERSONALE (decisione dell'utente:
// «personale e team devono arrivare da app personale»). Qui non si crea né si
// cancella più nessuno — chi vuole una persona in più la scrive dove abita,
// in Personale, e Budgets la vede al giro dopo. Questa rotta salva SOLO ciò
// che è pianificazione di Budgets: a quale maison attribuire il costo, e una
// nota. Una riga per anno di budget, agganciata all'id della persona in
// Personale (l'unicità la garantisce l'upsert qui sotto: il vincolo a
// database avrebbe richiesto un push con --accept-data-loss).

const CHIUSA = {
  error:
    "Le persone si creano e si eliminano in Deluxy Personale (la casa dei dati HR): Budgets le legge da lì.",
};

export async function POST() {
  return NextResponse.json(CHIUSA, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(CHIUSA, { status: 410 });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.personaleId !== "string" || !body.personaleId.trim()) {
    return NextResponse.json({ error: "personaleId mancante" }, { status: 400 });
  }
  const year = Number(body.year) || new Date().getFullYear();
  const personaleId = body.personaleId.trim();
  const nome = String(body.nome ?? "").trim() || "(da Personale)";
  const dati = {
    maisonId: body.maisonId ? String(body.maisonId) : null,
    note: body.note ? String(body.note).trim() : null,
  };
  // La maison deve esistere: un id inventato attribuirebbe il costo a nessuno.
  if (dati.maisonId) {
    const m = await prisma.maison.findUnique({ where: { id: dati.maisonId } });
    if (!m) return NextResponse.json({ error: "maison sconosciuta" }, { status: 400 });
  }

  const esistente = await prisma.dipendente.findFirst({ where: { year, personaleId } });
  if (esistente) {
    await prisma.dipendente.update({ where: { id: esistente.id }, data: dati });
    return NextResponse.json({ ok: true, id: esistente.id });
  }
  // La riga nasce vuota di tutto il resto (importo 0, tipo DIPENDENTE): quei
  // campi non si leggono più, il costo viene da Personale.
  const creato = await prisma.dipendente.create({
    data: { year, personaleId, nome, tipo: "DIPENDENTE", ...dati },
  });
  return NextResponse.json({ ok: true, id: creato.id });
}
