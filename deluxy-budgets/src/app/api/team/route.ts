import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Dal 06/09/2026 le squadre SONO le funzioni di Deluxy Personale (decisione
// dell'utente: «personale e team devono arrivare da app personale»): nome,
// responsabile e persone si leggono da lì e qui non si creano né si
// sciolgono più. Questa rotta salva SOLO ciò che è pianificazione di Budgets
// — il ruolo economico (struttura o ambiti di ricavo), il colore, l'ordine,
// una nota — agganciato all'id della funzione in Personale.

const COLORI = ["green", "gold", "blue", "purple", "orange", "neutral"];

const CHIUSA = {
  error:
    "Le squadre si creano e si sciolgono in Deluxy Personale (Funzioni): Budgets le legge da lì.",
};

export async function POST() {
  return NextResponse.json(CHIUSA, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(CHIUSA, { status: 410 });
}

function normalizza(body: Record<string, unknown>) {
  // Ruolo economico (29/08/2026). Tre stati: struttura, ambiti, non dichiarato.
  const struttura = body.struttura === true;
  const grezzi = Array.isArray(body.ambiti)
    ? body.ambiti.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  return {
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

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.personaleId !== "string" || !body.personaleId.trim()) {
    return NextResponse.json({ error: "personaleId mancante (l'id della funzione in Personale)" }, { status: 400 });
  }
  const personaleId = body.personaleId.trim();
  const nome = String(body.nome ?? "").trim() || "(da Personale)";
  const dati = normalizza(body);

  const sconosciuti = await ambitiValidi(dati.ambiti);
  if (sconosciuti) return NextResponse.json({ error: `ambito sconosciuto: ${sconosciuti}` }, { status: 400 });

  const esistente = await prisma.team.findFirst({ where: { personaleId } });
  if (esistente) {
    await prisma.team.update({ where: { id: esistente.id }, data: dati });
    return NextResponse.json({ ok: true, id: esistente.id });
  }
  // Il nome è unico a database (vincolo storico): se una riga del vecchio
  // roster porta già questo nome ma non è collegata, la si aggancia invece di
  // farne un doppione.
  const omonimo = await prisma.team.findUnique({ where: { nome } });
  if (omonimo && !omonimo.personaleId) {
    await prisma.team.update({ where: { id: omonimo.id }, data: { ...dati, personaleId } });
    return NextResponse.json({ ok: true, id: omonimo.id, collegato: true });
  }
  const creato = await prisma.team.create({
    data: { nome: omonimo ? `${nome} (${personaleId.slice(-6)})` : nome, personaleId, ...dati },
  });
  return NextResponse.json({ ok: true, id: creato.id });
}
