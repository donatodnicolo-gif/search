import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { segnalaClienteAFinance } from "@/lib/finance";
import { diffCampi, registraModifiche } from "@/lib/log-modifiche";
import { sistemaDellaChiave, mergeContatti } from "@/lib/merge";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";
import { PREFISSO_ANALISI, PREFISSO_FINANZIARIO, PREFISSO_FORNITORE } from "@/lib/stati";
import { ARCHIVIATA, registraPassaggio } from "@/lib/storico";

const INCLUDE = { contatti: true, riferimenti: true, capogruppo: true } as const;

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
    // ⚠️ Un id esterno vale DENTRO il sistema che l'ha coniato: «42» esiste in
    // cinque app e significa cinque aziende diverse. Cercandolo senza sistema,
    // con `findFirst`, l'app A chiedeva il proprio 42 e riceveva il partner di
    // B — con i dati bancari di B. Adesso si cerca nel sistema della CHIAVE.
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: { sistema_idEsterno: { sistema: sistemaDellaChiave(client.nome), idEsterno: id } },
      include: { partner: { include: INCLUDE } },
    });
    partner = ref?.partner ?? null;
  }
  if (!partner) return erroreApi(404, "Anagrafica non trovata");
  return NextResponse.json(serializzaPartner(partner, { vedeDatiFinanziari: client.leggeDatiFinanziari, vedePersone: client.leggePersone }));
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

  // I campi fiscali sono campi dell'azienda: si scrivono diretti.
  await prisma.partner.update({
    where: { id },
    data: { ...dati, ...(contattiWrite ? { contatti: contattiWrite } : {}) },
  });
  const aggiornato = (await prisma.partner.findUnique({ where: { id }, include: INCLUDE }))!;
  await registraModifiche(id, { origine: client.nome }, diffCampi(esistente, dati));
  if (dati.stato) {
    await registraPassaggio(id, esistente.stato, aggiornato.stato, client.nome);
    if (aggiornato.stato === "attivo" && esistente.stato !== "attivo") {
      await segnalaClienteAFinance(id, aggiornato.nome);
    }
  }
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
  if (dati.statoFornitore) {
    await registraPassaggio(
      id,
      `${PREFISSO_FORNITORE}${esistente.statoFornitore ?? ""}`,
      `${PREFISSO_FORNITORE}${aggiornato.statoFornitore ?? ""}`,
      client.nome,
    );
  }
  if (dati.attivo === false && esistente.attivo) {
    await registraPassaggio(id, aggiornato.stato, ARCHIVIATA, client.nome);
  } else if (dati.attivo === true && !esistente.attivo) {
    await registraPassaggio(id, ARCHIVIATA, aggiornato.stato, client.nome);
  }
  return NextResponse.json(serializzaPartner(aggiornato, { vedeDatiFinanziari: client.leggeDatiFinanziari, vedePersone: client.leggePersone }));
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
  return NextResponse.json(serializzaPartner(disattivato, { vedeDatiFinanziari: client.leggeDatiFinanziari, vedePersone: client.leggePersone }));
}
