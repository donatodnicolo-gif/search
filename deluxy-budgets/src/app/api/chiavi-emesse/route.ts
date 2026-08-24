import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generaChiave, SCOPE, type Scope } from "@/lib/chiavi-emesse";

// Le chiavi che **questa app emette** per le altre app Deluxy.
//
// ⚠️ Questa rotta si chiama **dalla pagina**, non dalle altre app: è protetta
// dalla stessa sessione che protegge tutto il resto dell'app (il middleware).
// Se fosse aperta, una chiave API basterebbe a farsene altre — e a quel punto
// revocarle non servirebbe più a niente.

export async function GET() {
  const chiavi = await prisma.chiaveEmessa.findMany({ orderBy: [{ revocata: "asc" }, { creata: "desc" }] });
  // Si restituisce **tutto tranne l'impronta**: non serve a chi guarda e non
  // deve girare per la rete più di una volta.
  return NextResponse.json({
    ok: true,
    chiavi: chiavi.map((c) => ({
      id: c.id,
      nome: c.nome,
      prefisso: c.prefisso,
      scope: c.scope,
      creata: c.creata,
      ultimoUso: c.ultimoUso,
      revocata: c.revocata,
      note: c.note,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  const scope = String(body?.scope ?? "lettura") as Scope;
  const note = String(body?.note ?? "").trim();

  if (!nome) {
    return NextResponse.json({ error: "Serve il nome dell'app a cui dai la chiave." }, { status: 400 });
  }
  if (nome.length > 60) return NextResponse.json({ error: "Nome troppo lungo." }, { status: 400 });
  if (!SCOPE.includes(scope)) {
    return NextResponse.json({ error: "Lo scope può essere «lettura» o «scrittura»." }, { status: 400 });
  }

  const { chiaro, prefisso, hash } = generaChiave();
  await prisma.chiaveEmessa.create({
    data: { nome, prefisso, hash, scope, note: note || null },
  });

  // ⚠️ **`chiaro` esce da qui una volta sola.** A database c'è solo l'impronta:
  // chiuso questo riquadro la chiave non la può più rileggere nessuno, e la
  // pagina lo deve dire prima che qualcuno chiuda la finestra.
  return NextResponse.json({ ok: true, chiaro, prefisso, scope, nome });
}

// **Revoca**, non cancella: sparita la riga sparisce anche la traccia di chi
// aveva accesso e da quando. Una chiave revocata resta nell'elenco, barrata.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  const riattiva = body?.riattiva === true;

  const esiste = await prisma.chiaveEmessa.findUnique({ where: { id } });
  if (!esiste) return NextResponse.json({ error: "Chiave non trovata." }, { status: 404 });

  const c = await prisma.chiaveEmessa.update({
    where: { id },
    data: { revocata: riattiva ? null : new Date() },
  });
  return NextResponse.json({ ok: true, revocata: c.revocata });
}
