import { prisma } from "@/lib/db";

// Esporta l'ipotesi congelata come CSV, pronto da mandare al fornitore o da
// aprire in Excel. Separatore punto e virgola e BOM UTF-8: è il formato che
// Excel italiano apre senza chiedere niente.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const piano = await prisma.pianoRiordino.findUnique({
    where: { id },
    include: { righe: { orderBy: { quantitaScelta: "desc" } } },
  });
  if (!piano) return new Response("Ipotesi non trovata", { status: 404 });

  const esc = (v: string | number | null | undefined) => {
    let s = String(v ?? "");
    // Neutralizza i prefissi-formula (=, +, -, @): Excel italiano apre il file
    // senza chiedere niente, e un nome prodotto scritto sul negozio da un'app
    // terza non deve poter eseguire nulla. I numeri veri restano numeri.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n: number) => n.toFixed(2).replace(".", ",");

  const righe = [
    ["Prodotto", "Ritmo pz/giorno", "Giacenza", "Proposti", "Da ordinare", "Costo unitario", "Totale", "Affidabilità", "Motivo"],
    ...piano.righe.map((r) => [
      esc(r.descrizione),
      num(r.venditeGiorno),
      r.giacenza,
      r.quantitaSuggerita,
      r.quantitaScelta,
      num(r.costoUnitario),
      num(r.quantitaScelta * r.costoUnitario),
      r.confidenza,
      esc(r.motivo),
    ]),
  ];

  const csv = "﻿" + righe.map((r) => r.join(";")).join("\r\n");
  const nomeFile = `${piano.nome.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "ipotesi-ordinativo"}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
    },
  });
}
