import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FONTI, nomeFonte } from "@/lib/calc";

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
  // La fonte si può cambiare al momento di consolidare: una proposta può essere
  // stata scritta prima che esistesse questa distinzione, e chi approva sa da
  // quale lavoro nasce.
  const fonteRichiesta = String(b?.fonte ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const p = await prisma.propostaBudget.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "proposta non trovata" }, { status: 404 });
  if (p.stato !== "APPROVATA") {
    return NextResponse.json({ error: "Si consolida solo una proposta approvata." }, { status: 400 });
  }

  let valori: { month: number; canale?: string; valore: number }[];
  try {
    valori = JSON.parse(p.valori);
  } catch {
    return NextResponse.json({ error: "i valori della proposta non si leggono" }, { status: 400 });
  }

  if (p.ambitoTipo === "MAISON") {
    // **Il canale lo dice la proposta, quando ce l'ha.** Dal 31/07/2026 una
    // proposta di maison si scrive linea per linea, quindi ogni riga sa già su
    // quale voce atterrare. Prima lo si chiedeva a chi consolidava: era un modo
    // educato di fargli indovinare, e un numero messo sulla voce sbagliata poi
    // non lo ritrova più nessuno. Le proposte vecchie — un numero solo per mese
    // — continuano a chiederlo, altrimenti non si potrebbero più applicare.
    const conCanale = valori.filter((v) => typeof v.canale === "string" && v.canale);
    const daScrivere = conCanale.length > 0
      ? conCanale.map((v) => ({ month: v.month, canale: v.canale as string, valore: v.valore }))
      : valori.map((v) => ({ month: v.month, canale, valore: v.valore }));
    if (conCanale.length === 0 && !canale) {
      return NextResponse.json(
        { error: "Serve la voce di budget su cui applicarla: questa proposta non dice se è D2C, Eventi o B2B." },
        { status: 400 }
      );
    }
    const maison = await prisma.maison.findUnique({ where: { slug: p.ambitoSlug ?? "" } });
    if (!maison) return NextResponse.json({ error: "maison non trovata" }, { status: 404 });
    // **Si scrive solo la propria fonte.** Il budget di un mese è la somma dei
    // contributi — pubblicità web, team commerciale, budget iniziale — e
    // ciascuno tocca il suo. Prima la casella era una sola: consolidare la
    // proposta della pubblicità cancellava il lavoro degli altri, e su
    // Deluxy.it sarebbero stati 648.404 € spariti in un clic. Come effetto
    // secondario, riconsolidare due volte la stessa proposta non raddoppia
    // niente: si riscrive la stessa riga.
    const fonte = FONTI.some((f) => f.key === fonteRichiesta) ? fonteRichiesta : p.fonte;
    for (const v of daScrivere) {
      await prisma.budgetEntry.upsert({
        where: {
          year_maisonId_month_canale_fonte: {
            year: p.year, maisonId: maison.id, month: v.month, canale: v.canale, fonte,
          },
        },
        create: { year: p.year, maisonId: maison.id, month: v.month, canale: v.canale, fonte, vendite: v.valore },
        update: { vendite: v.valore },
      });
    }
    const voci = [...new Set(daScrivere.map((v) => v.canale))].join(", ");
    const dove = `${maison.nome} · ${voci} · ${nomeFonte(fonte)}`;
    await prisma.propostaBudget.update({
      where: { id },
      data: { consolidataIl: new Date(), consolidataSu: dove },
    });
    return NextResponse.json({ ok: true, dove });
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
