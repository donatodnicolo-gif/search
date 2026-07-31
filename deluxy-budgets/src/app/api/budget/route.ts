import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Il budget di vendita di una maison, per mese e per canale.
//
// **Perché questa rotta è nata tardi (31/07/2026)**: fino a oggi in
// `BudgetEntry` scrivevano solo tre cose — il seed dal file Excel, `/margini`
// (che cancella le voci di una tipologia eliminata) e il consolidamento di una
// proposta. Cioè il budget si poteva **importare** o **ereditare**, ma non
// **scrivere**: mancava un canale a una maison e l'unico modo per aggiungerlo
// era inventarsi una proposta e consolidarla.
//
// E non è un dettaglio di comodità: da `vendite` dipende quanto si può spendere
// in pubblicità — `advConsentito = vendite del mese × advPercent` — quindi un
// canale senza budget non è «un canale a zero», è **un canale che non porta ADV
// con sé**.
//
// Si scrive **solo il livello pubblicato** (raggiungibile). Sfidante e
// irraggiungibile non sono dati: sono il pubblicato per un moltiplicatore, e
// lasciarli scrivere vorrebbe dire salvare uno scenario come se fosse un
// budget.

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const anno = Math.trunc(Number(b?.anno));
  const slug = String(b?.maison ?? "");
  const month = Math.trunc(Number(b?.month));
  const canale = String(b?.canale ?? "");
  const vendite = Number(b?.vendite);

  if (!(anno >= 2000 && anno <= 2100)) return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  if (!(month >= 1 && month <= 12)) return NextResponse.json({ error: "mese non valido" }, { status: 400 });
  if (!Number.isFinite(vendite) || vendite < 0) {
    return NextResponse.json({ error: "importo non valido" }, { status: 400 });
  }

  const maison = await prisma.maison.findUnique({ where: { slug } });
  if (!maison) return NextResponse.json({ error: "maison non trovata" }, { status: 404 });

  // Il canale deve essere una **tipologia di servizio esistente**: le colonne
  // del budget sono le sue, e accettare uno slug inventato creerebbe una riga
  // che non compare in nessuna tabella — un importo che sparisce.
  const tipologia = await prisma.tipologiaServizio.findUnique({ where: { slug: canale } });
  if (!tipologia) return NextResponse.json({ error: "canale non previsto" }, { status: 400 });

  await prisma.budgetEntry.upsert({
    where: { year_maisonId_month_canale: { year: anno, maisonId: maison.id, month, canale } },
    create: { year: anno, maisonId: maison.id, month, canale, vendite },
    update: { vendite },
  });

  return NextResponse.json({ ok: true });
}
