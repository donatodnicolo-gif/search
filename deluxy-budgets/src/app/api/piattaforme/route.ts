import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { meseChiuso } from "@/lib/periodo";

const COLORI = ["blue", "purple", "green", "gold", "orange", "neutral"];

function percent(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

// Salva in blocco le % di split (piattaforma × mese) di un anno.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const voci = Array.isArray(body?.split) ? body.split : null;
  if (!year || !voci) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  // Per quale brand vale questa ripartizione: stringa vuota = azienda, cioe
  // quella predefinita. Arriva una volta sola nel corpo, non per riga: salvare
  // meta ripartizione su un brand e meta su un altro non e un gesto che esiste.
  const ambito = String(body?.ambito ?? "");
  // Un istante solo per tutta la scrittura: righe salvate nello stesso gesto
  // devono portare la stessa ora, se no «quando l ho salvata» diventa un
  // intervallo invece di un momento.
  const adesso = new Date();

  // ⚠️ **Il blocco dei mesi chiusi viveva solo nel form** (difetto trovato e
  // chiuso il 27/08/2026). Un input disabilitato è una cortesia verso chi
  // guarda la pagina, non un controllo: una scheda rimasta aperta a cavallo
  // del cambio mese rispedisce il mese chiuso e lo riscrive — e su un mese
  // chiuso quella quota non è più una decisione, è la misura di quello che è
  // uscito. Le rotte gemelle di Spese e Commerciale si difendono così da
  // settimane, e **dichiarano cosa hanno scartato**: un «ok» secco su una
  // richiesta accolta a metà è il modo più veloce per credere di aver salvato.
  //
  // ⚠️ Nota per chi passa di qui: lo split dei mesi chiusi esce anche
  // dall'API verso Marketing (/api/v1/maison), che lo legge grezzo senza la
  // maschera che invece la pagina applica. Finché quella resta così, una
  // scrittura sporca qui si vede là, non qui.
  const mesiChiusiIgnorati: number[] = [];
  for (const v of voci) {
    const piattaformaId = String(v?.piattaformaId ?? "");
    const month = Number(v?.month);
    if (!piattaformaId || month < 1 || month > 12) continue;
    if (meseChiuso(year, month)) {
      if (!mesiChiusiIgnorati.includes(month)) mesiChiusiIgnorati.push(month);
      continue;
    }
    await prisma.piattaformaSplit.upsert({
      where: { year_piattaformaId_month_ambito: { year, piattaformaId, month, ambito } },
      update: { percent: percent(v.percent), aggiornatoIl: adesso },
      create: { year, piattaformaId, month, ambito, percent: percent(v.percent), aggiornatoIl: adesso },
    });
  }
  return NextResponse.json({ ok: true, mesiChiusiIgnorati });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const esiste = await prisma.piattaformaAdv.findUnique({ where: { nome } });
  if (esiste) return NextResponse.json({ error: "esiste già una piattaforma con questo nome" }, { status: 409 });

  const quante = await prisma.piattaformaAdv.count();
  const creata = await prisma.piattaformaAdv.create({
    data: {
      nome,
      colore: COLORI.includes(String(body?.colore)) ? String(body.colore) : "neutral",
      ordine: quante,
    },
  });
  return NextResponse.json({ ok: true, id: creata.id });
}

// Rimuovere una piattaforma cancella anche le sue % (cascade nello schema).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.piattaformaAdv.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
