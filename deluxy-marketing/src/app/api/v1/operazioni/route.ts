import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";
import { validaModifica } from "@/lib/guardrail";

// GET /api/v1/operazioni?canale=google_ads&account=825-518-1560
// Restituisce SOLO le operazioni già approvate a mano: è quello che lo script
// di Google Ads va a prendere per eseguirle. Niente approvazione, niente
// esecuzione — mai. (Regola AGENDA PIANI dei Definitivi.)
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const operazioni = await prisma.operazioneAdv.findMany({
    where: {
      stato: "approvata",
      canale: p.get("canale") ?? "google_ads",
      ...(p.get("account") ? { account: p.get("account")! } : {}),
    },
    orderBy: { approvataIl: "asc" },
    take: 50,
  });
  return NextResponse.json({
    operazioni: operazioni.map((o) => ({
      id: o.id,
      tipo: o.tipo,
      bersaglio: o.bersaglio,
      idEsterno: o.idEsterno,
      parametri: o.parametri ? JSON.parse(o.parametri) : {},
      livello: o.livello,
    })),
  });
}

// POST /api/v1/operazioni — mette in coda un'operazione (stato "in_attesa").
// Passa dal change control: se il guardrail blocca, l'operazione non nasce.
// Body: { tipo*, bersaglio*, idEsterno?, parametri?, motivo?, livello?,
//         campagnaId?, account?, canale? }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.tipo || !body.bersaglio) {
    return erroreApi(400, "Campi obbligatori: tipo, bersaglio");
  }

  // Se l'operazione tocca una campagna nota, valgono i guardrail del doc 11.
  if (body.campagnaId) {
    const campagna = await prisma.campagna.findUnique({
      where: { id: String(body.campagnaId) },
      include: {
        modifiche: { orderBy: { eseguitaIl: "desc" }, take: 1 },
        incidenti: { where: { stato: "aperto" }, select: { codice: true } },
      },
    });
    if (!campagna) return erroreApi(404, "Campagna non trovata");
    if (campagna.incidenti.length > 0) {
      return erroreApi(
        409,
        `Freeze attivo: la campagna è coperta dall'incidente ${campagna.incidenti[0].codice} (voce APERTA nello storico errori).`
      );
    }
    const esito = validaModifica({
      classe: campagna.classe,
      livello: body.livello ?? "L1",
      deltaBudgetPct: body.deltaBudgetPct != null ? Number(body.deltaBudgetPct) : null,
      rollbackPiano: body.rollbackPiano ?? null,
      ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
    });
    if (esito.blocchi.length > 0) {
      return NextResponse.json({ errore: "Bloccata dal change control", blocchi: esito.blocchi }, { status: 409 });
    }
  }

  const operazione = await prisma.operazioneAdv.create({
    data: {
      tipo: String(body.tipo),
      canale: body.canale ?? "google_ads",
      account: body.account ?? null,
      bersaglio: String(body.bersaglio),
      idEsterno: body.idEsterno ? String(body.idEsterno) : null,
      parametri: body.parametri ? JSON.stringify(body.parametri) : null,
      motivo: body.motivo ?? null,
      livello: body.livello ?? "L1",
      prima: body.prima ?? null,
      campagnaId: body.campagnaId ?? null,
      azioneId: body.azioneId ?? null,
      richiestaDa: cliente.nome,
    },
  });
  await registra({
    autore: cliente.nome,
    tipo: "creazione",
    entita: "operazione",
    entitaId: operazione.id,
    titolo: `In coda (da approvare): ${operazione.tipo} su ${operazione.bersaglio}`,
    dettaglio: operazione.motivo,
  });
  return NextResponse.json({ operazione }, { status: 201 });
}
