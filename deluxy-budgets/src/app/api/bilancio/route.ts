import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { numero, VOCI_DIGITABILI } from "@/lib/bilancio";

// Le voci del conto economico civilistico. I **totali non si scrivono**: si
// calcolano da qui a valle (src/lib/bilancio.ts), perché un bilancio in cui il
// totale è un campo libero prima o poi non quadra e nessuno se ne accorge.

const codiceValido = (c: string) => VOCI_DIGITABILI.some((v) => v.codice === c);

export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const anno = Math.trunc(Number(b?.anno));
  const codice = String(b?.codice ?? "");
  const importo = numero(b?.importo);
  if (!(anno >= 2000 && anno <= 2100)) return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  if (!codiceValido(codice)) return NextResponse.json({ error: "voce non prevista dallo schema" }, { status: 400 });
  if (importo === null) return NextResponse.json({ error: "importo non valido" }, { status: 400 });

  // La ripartizione mensile è facoltativa. Se c'è deve avere dodici valori e
  // sommare all'annuo: una ripartizione che non torna col totale è un errore da
  // fermare qui, non da scoprire in una tabella fra sei mesi.
  // ⚠️⚠️ **ASSENTE NON È VUOTO** (difetto trovato e chiuso il 27/08/2026).
  // Questa voce la scrivono DUE form diversi con payload parziali: l'editor
  // manda `importo` + `mesi` (mai `nota`), la proposta manda `importo` +
  // `nota` (mai `mesi`). Finché l'assenza diventava `null`, **correggere
  // l'importo cancellava la ripartizione mensile** — e non era un caso di
  // bordo, era il gesto più frequente della pagina. Ora un campo che non
  // arriva resta `undefined`, che Prisma **non scrive**: si tocca solo quello
  // che si è mandato. È la stessa regola già imparata su `PATCH
  // /api/commerciale`, dove salvare i margini cancellava i collegamenti a
  // Finance.
  let mesi: string | null | undefined = undefined;
  if (b?.mesi === null) mesi = null; // mandare esplicitamente null = «togli la ripartizione»
  if (Array.isArray(b?.mesi) && b.mesi.length === 12) {
    const v = b.mesi.map((x: unknown) => numero(x) ?? 0);
    const somma = v.reduce((s: number, x: number) => s + x, 0);
    if (Math.abs(somma - importo) > 1) {
      return NextResponse.json(
        { error: `La ripartizione mensile somma ${somma.toFixed(2)} ma la voce vale ${importo.toFixed(2)}.` },
        { status: 400 }
      );
    }
    mesi = JSON.stringify(v);
  }

  const nota =
    b?.nota === undefined
      ? undefined
      : typeof b.nota === "string" && b.nota.trim()
        ? b.nota.trim()
        : null;
  await prisma.voceBilancio.upsert({
    where: { anno_codice: { anno, codice } },
    create: { anno, codice, importo, mesi: mesi ?? null, nota: nota ?? null },
    update: { importo, mesi, nota },
  });
  return NextResponse.json({ ok: true });
}

// Import da testo incollato: una riga per voce, «codice<separatore>importo».
// Regge tab, punto e virgola e virgola come separatore, e i numeri all'italiana
// (1.234,56) — è quello che esce copiando da un PDF o da Excel.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const anno = Math.trunc(Number(b?.anno));
  const testo = String(b?.testo ?? "");
  if (!(anno >= 2000 && anno <= 2100)) return NextResponse.json({ error: "anno non valido" }, { status: 400 });

  const righe = testo.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const importate: string[] = [];
  const ignorate: string[] = [];
  for (const riga of righe) {
    // Il codice è il **primo** pezzo, l'importo è **tutto il resto**: non si
    // spezza sulle virgole, che in un bilancio italiano sono i decimali (era il
    // bug che faceva arrivare «742.300,50» come 50).
    const m = /^\s*([A-Za-z][A-Za-z0-9]{0,7})\s*[\t;:|]?\s*(.+)$/.exec(riga);
    if (!m) { ignorate.push(riga); continue; }
    const codice = m[1].toUpperCase().replace(/[^A-Z0-9]/g, "");
    const importo = numero(m[2]);
    if (!codiceValido(codice) || importo === null) { ignorate.push(riga); continue; }
    await prisma.voceBilancio.upsert({
      where: { anno_codice: { anno, codice } },
      create: { anno, codice, importo },
      update: { importo },
    });
    importate.push(codice);
  }
  return NextResponse.json({ ok: true, importate, ignorate });
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const anno = Math.trunc(Number(sp.get("anno")));
  const codice = sp.get("codice");
  if (!(anno >= 2000 && anno <= 2100)) return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  if (codice) await prisma.voceBilancio.deleteMany({ where: { anno, codice } });
  else await prisma.voceBilancio.deleteMany({ where: { anno } });
  return NextResponse.json({ ok: true });
}
