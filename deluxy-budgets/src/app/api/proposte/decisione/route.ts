import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// La risposta dell'admin a una proposta di budget, e — se approvata — il
// passaggio nel budget ufficiale.
//
// Sono due gesti distinti di proposito. **Approvare** vuol dire «ho letto, va
// bene»; **consolidare** vuol dire riscrivere i numeri del budget pubblicato.
// Farli succedere insieme sarebbe comodo e sbagliato: si approva anche una
// proposta che poi si applica in parte, o più tardi, o mai.

const STATI = ["INVIATA", "APPROVATA", "RESPINTA"];

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? "");
  const stato = String(b?.stato ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  if (!STATI.includes(stato)) return NextResponse.json({ error: "stato non valido" }, { status: 400 });

  const notaAdmin = typeof b?.notaAdmin === "string" && b.notaAdmin.trim() ? b.notaAdmin.trim() : null;
  // Respingere senza dire perché è il modo più veloce per non ricevere più
  // proposte: si chiede una motivazione.
  if (stato === "RESPINTA" && !notaAdmin) {
    return NextResponse.json({ error: "Per respingere serve una motivazione: chi l'ha scritta deve sapere cosa correggere." }, { status: 400 });
  }

  await prisma.propostaBudget.update({
    where: { id },
    data: { stato, notaAdmin, decisaIl: stato === "INVIATA" ? null : new Date() },
  });
  return NextResponse.json({ ok: true });
}

// Consolidamento: i dodici valori della proposta diventano il budget ufficiale.
// Sovrascrive quello che c'era — ed è il motivo per cui è un gesto separato,
// esplicito, e lascia traccia sulla proposta.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const id = String(b?.id ?? "");
  const canale = String(b?.canale ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const p = await prisma.propostaBudget.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "proposta non trovata" }, { status: 404 });
  if (p.stato !== "APPROVATA") {
    return NextResponse.json({ error: "Si consolida solo una proposta approvata." }, { status: 400 });
  }

  let valori: { month: number; valore: number }[];
  try {
    valori = JSON.parse(p.valori);
  } catch {
    return NextResponse.json({ error: "i valori della proposta non si leggono" }, { status: 400 });
  }

  if (p.ambitoTipo === "MAISON") {
    if (!canale) {
      return NextResponse.json(
        { error: "Serve la voce di budget su cui applicarla: una proposta per maison non dice se è D2C, Eventi o B2B." },
        { status: 400 }
      );
    }
    const maison = await prisma.maison.findUnique({ where: { slug: p.ambitoSlug ?? "" } });
    if (!maison) return NextResponse.json({ error: "maison non trovata" }, { status: 404 });
    for (const v of valori) {
      await prisma.budgetEntry.upsert({
        where: { year_maisonId_month_canale: { year: p.year, maisonId: maison.id, month: v.month, canale } },
        create: { year: p.year, maisonId: maison.id, month: v.month, canale, vendite: v.valore },
        update: { vendite: v.valore },
      });
    }
    await prisma.propostaBudget.update({
      where: { id },
      data: { consolidataIl: new Date(), consolidataSu: `${maison.nome} · ${canale}` },
    });
    return NextResponse.json({ ok: true, dove: `${maison.nome} · ${canale}` });
  }

  if (p.ambitoTipo === "LINEA") {
    const linea = await prisma.lineaCommerciale.findUnique({ where: { slug: p.ambitoSlug ?? "" } });
    if (!linea) return NextResponse.json({ error: "linea non trovata" }, { status: 404 });
    for (const v of valori) {
      await prisma.targetLinea.upsert({
        where: { year_lineaId_month: { year: p.year, lineaId: linea.id, month: v.month } },
        create: { year: p.year, lineaId: linea.id, month: v.month, valore: v.valore, clienti: 0 },
        update: { valore: v.valore },
      });
    }
    await prisma.propostaBudget.update({
      where: { id },
      data: { consolidataIl: new Date(), consolidataSu: linea.nome },
    });
    return NextResponse.json({ ok: true, dove: linea.nome });
  }

  // Una proposta «tutta l'azienda» non ha un posto dove atterrare: il budget si
  // scrive per maison o per linea. Si dice, invece di far finta di applicarla.
  return NextResponse.json(
    { error: "Una proposta globale non si può consolidare: il budget si scrive per maison o per linea commerciale." },
    { status: 400 }
  );
}
