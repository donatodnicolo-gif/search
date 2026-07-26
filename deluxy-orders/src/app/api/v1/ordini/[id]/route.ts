import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaOrdine, INCLUDE_ORDINE } from "@/lib/ordini";
import { ordinali } from "@/lib/repeater";
import { CATEGORIE_PAGAMENTO } from "@/lib/classificazione";

// GET /api/v1/ordini/:id — un ordine con la sua classificazione (sola lettura).
// Come l'elenco, un ordine ANNULLATO non viene servito: risponde 410 (non più
// disponibile) spiegando perché, invece di restituirlo come se fosse valido.
// Con `?annullati=inclusi` lo si ottiene comunque, per chi deve gestirlo
// davvero (rimborsi, riconciliazioni).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const { id } = await params;
  const ordine = await prisma.ordine.findUnique({ where: { id }, include: INCLUDE_ORDINE });
  if (!ordine) return erroreApi(404, "Ordine non trovato");

  const includiAnnullati = req.nextUrl.searchParams.get("annullati")?.trim().toLowerCase() === "inclusi";
  if (ordine.annullatoIl && !includiAnnullati) {
    return erroreApi(
      410,
      `Ordine ${ordine.numero} annullato il ${ordine.annullatoIl.toISOString().slice(0, 10)}: non viene servito. Usa ?annullati=inclusi se devi gestirlo comunque.`,
    );
  }
  return NextResponse.json(serializzaOrdine(ordine, undefined, await ordinali([ordine.id])));
}

// PATCH /api/v1/ordini/:id — riclassifica un ordine (richiede chiave di scrittura).
// Corpo JSON, tutti i campi opzionali:
//   { stato: "<chiave>", etichette: ["urgente"], categoriaPagamento, tipoConsegna,
//     tipoProdotto, canale, assegnatoApp, fornitore, responsabile,
//     classificazioni: { ...libero }, noteInterne }
// Le etichette rimpiazzano l'intero set; quelle non esistenti vengono create.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  const esiste = await prisma.ordine.findUnique({ where: { id }, select: { id: true } });
  if (!esiste) return erroreApi(404, "Ordine non trovato");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non valido");
  }

  const data: Record<string, unknown> = {};

  if ("categoriaPagamento" in body) {
    const c = String(body.categoriaPagamento);
    if (!CATEGORIE_PAGAMENTO.includes(c as (typeof CATEGORIE_PAGAMENTO)[number])) {
      return erroreApi(400, `categoriaPagamento non valida (${CATEGORIE_PAGAMENTO.join(", ")})`);
    }
    data.categoriaPagamento = c;
    data.categoriaPagamentoManuale = true;
  }
  for (const campo of ["tipoConsegna", "tipoProdotto", "canale", "assegnatoApp", "fornitore", "responsabile", "noteInterne"] as const) {
    if (campo in body) data[campo] = body[campo] == null ? null : String(body[campo]);
  }
  if ("classificazioni" in body) {
    data.classificazioni = body.classificazioni == null ? Prisma.DbNull : body.classificazioni;
  }

  if ("stato" in body) {
    if (body.stato == null) {
      data.statoId = null;
    } else {
      const stato = await prisma.statoOrdine.findUnique({ where: { chiave: String(body.stato) } });
      if (!stato) return erroreApi(400, `stato "${body.stato}" inesistente`);
      data.statoId = stato.id;
    }
  }

  if ("etichette" in body) {
    if (!Array.isArray(body.etichette)) return erroreApi(400, "etichette deve essere un array di nomi");
    const nomi = body.etichette.map((x) => String(x).trim()).filter(Boolean);
    for (const nome of nomi) {
      await prisma.etichetta.upsert({ where: { nome }, create: { nome }, update: {} });
    }
    const rec = await prisma.etichetta.findMany({ where: { nome: { in: nomi } }, select: { id: true } });
    data.etichette = { set: rec.map((r) => ({ id: r.id })) };
  }

  data.ultimaClassifica = new Date();

  await prisma.ordine.update({ where: { id }, data: data as Prisma.OrdineUncheckedUpdateInput });
  await prisma.eventoOrdine.create({
    data: { ordineId: id, tipo: "categoria", descrizione: `Riclassificato via API (${client.nome})`, autore: client.nome },
  });

  const aggiornato = await prisma.ordine.findUnique({ where: { id }, include: INCLUDE_ORDINE });
  return NextResponse.json(serializzaOrdine(aggiornato!, undefined, await ordinali([aggiornato!.id])));
}
