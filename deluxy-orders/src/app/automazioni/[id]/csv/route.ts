import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// I messaggi preparati da un'automazione, in CSV: è il modo con cui oggi si
// esce dall'app per mandarli davvero (import in uno strumento di invio, o
// semplicemente per controllarli in due prima di premere).

const COLONNE = ["nome", "destinatario", "oggetto", "messaggio", "stato", "preparato", "inviato"];

function cella(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await prisma.automazione.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ errore: "Automazione non trovata" }, { status: 404 });

  const messaggi = await prisma.messaggioAutomazione.findMany({
    where: { automazioneId: id },
    orderBy: { preparatoIl: "desc" },
    take: 20000,
  });

  const righe = [
    COLONNE.join(";"),
    ...messaggi.map((m) =>
      [m.nome, m.destinatario, m.oggetto, m.testo, m.stato, iso(m.preparatoIl), iso(m.inviatoIl)]
        .map(cella)
        .join(";"),
    ),
  ];

  // BOM: senza, Excel su Windows sbaglia gli accenti.
  const corpo = "﻿" + righe.join("\r\n") + "\r\n";
  const nome = a.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "automazione";

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deluxy-${nome}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
