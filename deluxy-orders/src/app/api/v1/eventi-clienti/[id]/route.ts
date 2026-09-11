import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { TIPI_DELICATI, TIPI_EVENTO } from "@/lib/eventi";

// PATCH /api/v1/eventi-clienti/{id} — una persona corregge una ricorrenza da
// un'altra app (il CRM, 11/09/2026): il tipo (compleanno, anniversario…),
// «per chi» (destinatario), il titolo, le note, lo stato. Chiave di scrittura.
// Quello che scrive una persona vince sull'AI e sulle parole (tipoDa = manuale)
// e il rilevamento non lo tocca più. Cambiare il destinatario cambia
// l'identità della ricorrenza (chiave+destinatario+mese+giorno): se esiste
// già una riga con quel destinatario, si fondono (vince la più ricca).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo non valido: serve un JSON");
  }

  const evento = await prisma.eventoCliente.findUnique({ where: { id } });
  if (!evento) return erroreApi(404, "Ricorrenza non trovata");

  const dati: {
    tipo?: string;
    tipoDa?: string;
    titolo?: string;
    note?: string | null;
    stato?: string;
    motivoTipo?: string | null;
  } = {};
  if (body.tipo !== undefined) {
    const tipo = String(body.tipo).trim().toLowerCase();
    if (!TIPI_EVENTO.some((t) => t.chiave === tipo)) return erroreApi(400, `Tipo sconosciuto: ${tipo}`);
    dati.tipo = tipo;
    dati.tipoDa = "manuale";
    dati.motivoTipo = `Scritto a mano da ${client.nome}`;
  }
  if (body.titolo !== undefined) dati.titolo = String(body.titolo).trim().slice(0, 120);
  if (body.note !== undefined) dati.note = body.note ? String(body.note).slice(0, 500) : null;
  if (body.stato !== undefined) {
    const stato = String(body.stato);
    if (!["da-confermare", "confermato", "ignorato"].includes(stato)) return erroreApi(400, `Stato sconosciuto: ${stato}`);
    dati.stato = stato;
  }

  let destinatario: string | undefined;
  if (body.destinatario !== undefined) destinatario = String(body.destinatario).trim().slice(0, 120);

  if (destinatario !== undefined && destinatario.toLowerCase() !== evento.destinatario.toLowerCase()) {
    const gemella = await prisma.eventoCliente.findUnique({
      where: { chiave_destinatario_mese_giorno: { chiave: evento.chiave, destinatario, mese: evento.mese, giorno: evento.giorno } },
    });
    if (gemella) {
      // Stessa data, stesso cliente, stesso «per chi»: è la stessa ricorrenza.
      const ordini = [...new Set([...gemella.ordini.split(" "), ...evento.ordini.split(" ")].filter(Boolean))].join(" ");
      const aggiornata = await prisma.$transaction(async (tx) => {
        const a = await tx.eventoCliente.update({
          where: { id: gemella.id },
          data: {
            ...dati,
            ordini,
            ricorrenze: Math.max(gemella.ricorrenze, evento.ricorrenze),
            primoAnno: Math.min(gemella.primoAnno, evento.primoAnno),
            ultimoAnno: Math.max(gemella.ultimoAnno, evento.ultimoAnno),
            stato: dati.stato ?? "confermato",
          },
        });
        await tx.eventoCliente.delete({ where: { id: evento.id } });
        return a;
      });
      return NextResponse.json({ ok: true, id: aggiornata.id, fusa: true, delicato: TIPI_DELICATI.includes(aggiornata.tipo) });
    }
  }

  const aggiornata = await prisma.eventoCliente.update({
    where: { id },
    data: { ...dati, ...(destinatario !== undefined ? { destinatario } : {}), stato: dati.stato ?? "confermato" },
  });
  return NextResponse.json({ ok: true, id: aggiornata.id, fusa: false, delicato: TIPI_DELICATI.includes(aggiornata.tipo) });
}
