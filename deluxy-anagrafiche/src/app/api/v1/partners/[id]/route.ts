import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { CAMPI_FINANZIARI, propagaDatiFinanziari } from "@/lib/insegna";
import { mergeContatti } from "@/lib/merge";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";
import { PREFISSO_ANALISI, PREFISSO_FINANZIARIO } from "@/lib/stati";
import { ARCHIVIATA, registraPassaggio } from "@/lib/storico";

const INCLUDE = { contatti: true, riferimenti: true } as const;

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/partners/:id — dettaglio. L'id può essere l'id del registro, il
// platformId o (via riferimento esterno) l'id di qualsiasi app che lo abbia
// registrato — così tutte le app risolvono lo stesso partner con la propria chiave.
export async function GET(req: NextRequest, { params }: Params) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  let partner =
    (await prisma.partner.findUnique({ where: { id }, include: INCLUDE })) ??
    (await prisma.partner.findUnique({ where: { platformId: id }, include: INCLUDE }));
  if (!partner) {
    const ref = await prisma.riferimentoEsterno.findFirst({
      where: { idEsterno: id },
      include: { partner: { include: INCLUDE } },
    });
    partner = ref?.partner ?? null;
  }
  if (!partner) return erroreApi(404, "Anagrafica non trovata");
  return NextResponse.json(serializzaPartner(partner));
}

// PATCH /api/v1/partners/:id — aggiornamento parziale mirato (richiede scrittura).
// A differenza del POST è esplicito: i campi indicati vengono impostati (writer
// fidato). I referenti però si fondono per identità, non si sostituiscono, per
// non cancellare quelli inseriti da altre app.
export async function PATCH(req: NextRequest, { params }: Params) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaPartner(body, false);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);
  const { dati, contatti } = risultato;

  const esistente = await prisma.partner.findUnique({ where: { id } });
  if (!esistente) return erroreApi(404, "Anagrafica non trovata");

  let contattiWrite: import("@prisma/client").Prisma.ContattoUpdateManyWithoutPartnerNestedInput | undefined;
  if (contatti) {
    const esistentiC = await prisma.contatto.findMany({ where: { partnerId: id } });
    const ops = mergeContatti(esistentiC, contatti, client.nome.replace(/^deluxy-/, ""));
    contattiWrite = { create: ops.create, update: ops.update };
  }

  const aggiornato = await prisma.partner.update({
    where: { id },
    data: {
      ...dati,
      ...(contattiWrite ? { contatti: contattiWrite } : {}),
    },
    include: INCLUDE,
  });
  // La fatturazione è della società: propaga i campi finanziari alle sedi
  if ((CAMPI_FINANZIARI as readonly string[]).some((c) => c in dati)) {
    await propagaDatiFinanziari(id);
  }
  if (dati.stato) await registraPassaggio(id, esistente.stato, aggiornato.stato, client.nome);
  if (dati.statoFinanziario) {
    await registraPassaggio(
      id,
      `${PREFISSO_FINANZIARIO}${esistente.statoFinanziario}`,
      `${PREFISSO_FINANZIARIO}${aggiornato.statoFinanziario}`,
      client.nome,
    );
  }
  if (dati.statoAnalisi) {
    await registraPassaggio(
      id,
      `${PREFISSO_ANALISI}${esistente.statoAnalisi ?? ""}`,
      `${PREFISSO_ANALISI}${aggiornato.statoAnalisi ?? ""}`,
      client.nome,
    );
  }
  if (dati.attivo === false && esistente.attivo) {
    await registraPassaggio(id, aggiornato.stato, ARCHIVIATA, client.nome);
  } else if (dati.attivo === true && !esistente.attivo) {
    await registraPassaggio(id, ARCHIVIATA, aggiornato.stato, client.nome);
  }
  return NextResponse.json(serializzaPartner(aggiornato));
}

// DELETE /api/v1/partners/:id — disattivazione (soft delete: attivo=false).
// Nessuna cancellazione fisica: il registro è la fonte di verità storica.
export async function DELETE(req: NextRequest, { params }: Params) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  const esistente = await prisma.partner.findUnique({ where: { id } });
  if (!esistente) return erroreApi(404, "Anagrafica non trovata");

  const disattivato = await prisma.partner.update({
    where: { id },
    data: { attivo: false },
    include: INCLUDE,
  });
  if (esistente.attivo) {
    await registraPassaggio(id, esistente.stato, ARCHIVIATA, client.nome);
  }
  return NextResponse.json(serializzaPartner(disattivato));
}
