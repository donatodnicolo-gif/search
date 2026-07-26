import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  MOTIVI_FEEDBACK,
  normalizzaVoto,
  ricalcolaValutazioneD2C,
  serializzaFeedback,
  valutazioneD2C,
} from "@/lib/feedback-d2c";
import { nomeSistema } from "@/lib/merge";

// Feedback D2C: il giudizio del cliente finale su una consegna servita da un
// partner. Da qui nasce la "valutazione D2C" dell'anagrafica (media 1–5).
//
// GET  /api/v1/feedback   — elenco (lettura)
// POST /api/v1/feedback   — invio di un feedback (chiave con scrittura piena
//                            o scope `scritturaFeedback`)

function pulisci(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Trova il partner a cui appartiene il feedback. Cascata: id del registro →
// riferimento esterno (sistema+idEsterno dell'app che manda) → platformId →
// negozio + città. Nessuna euristica fuzzy: se non aggancia, si risponde 404 e
// il feedback NON si attacca a un partner a caso.
async function trovaPartner(
  body: Record<string, unknown>,
  sistemaChiamante: string,
): Promise<string | null> {
  const id = pulisci(body.partnerId);
  if (id) {
    const p = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
    if (p) return p.id;
  }

  const rif = (body.riferimento ?? {}) as { sistema?: string; idEsterno?: string };
  if (rif.idEsterno) {
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: {
        sistema_idEsterno: {
          sistema: nomeSistema(sistemaChiamante, rif.sistema),
          idEsterno: String(rif.idEsterno),
        },
      },
      select: { partnerId: true },
    });
    if (ref) return ref.partnerId;
  }

  const platformId = pulisci(body.platformId);
  if (platformId) {
    const p = await prisma.partner.findUnique({ where: { platformId }, select: { id: true } });
    if (p) return p.id;
  }

  const negozio = pulisci(body.negozio) ?? pulisci(body.nome);
  const citta = pulisci(body.citta);
  if (negozio) {
    const p = await prisma.partner.findFirst({
      where: {
        nome: { equals: negozio, mode: "insensitive" },
        ...(citta ? { citta: { equals: citta, mode: "insensitive" } } : {}),
      },
      select: { id: true },
    });
    if (p) return p.id;
  }
  return null;
}

// GET /api/v1/feedback — elenco dei feedback, dal più recente.
// Filtri: partnerId, canale, sistema, votoMax/votoMin, dal/al (ISO), page, perPage.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where: Prisma.FeedbackD2CWhereInput = {};

  const partnerId = p.get("partnerId")?.trim();
  if (partnerId) where.partnerId = partnerId;
  const canale = p.get("canale")?.trim();
  if (canale) where.canale = canale;
  const sistema = p.get("sistema")?.trim();
  if (sistema) where.sistema = sistema;

  const filtroVoto: Prisma.IntFilter = {};
  const votoMin = Number(p.get("votoMin"));
  const votoMax = Number(p.get("votoMax"));
  if (p.get("votoMin") && isFinite(votoMin)) filtroVoto.gte = votoMin;
  if (p.get("votoMax") && isFinite(votoMax)) filtroVoto.lte = votoMax;
  if (Object.keys(filtroVoto).length > 0) where.voto = filtroVoto;

  const filtroData: Prisma.DateTimeFilter = {};
  const dal = p.get("dal");
  const al = p.get("al");
  if (dal && !isNaN(new Date(dal).getTime())) filtroData.gte = new Date(dal);
  if (al && !isNaN(new Date(al).getTime())) filtroData.lte = new Date(al);
  if (Object.keys(filtroData).length > 0) where.dataFeedback = filtroData;

  const pagina = Math.max(1, Number(p.get("page")) || 1);
  const perPagina = Math.min(200, Math.max(1, Number(p.get("perPage")) || 50));

  const [totale, dati] = await Promise.all([
    prisma.feedbackD2C.count({ where }),
    prisma.feedbackD2C.findMany({
      where,
      orderBy: { dataFeedback: "desc" },
      skip: (pagina - 1) * perPagina,
      take: perPagina,
    }),
  ]);

  // Chiedendo un partner preciso si ottiene anche la sua pagella, così
  // l'app non deve rifare la media (ed evita di leggerla come zero).
  let valutazione = null;
  if (partnerId) {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        votoD2C: true,
        numeroFeedbackD2C: true,
        ultimoFeedbackD2C: true,
        votoD2CAggiornatoIl: true,
      },
    });
    if (partner) valutazione = valutazioneD2C(partner);
  }

  return NextResponse.json({
    totale,
    pagina,
    perPagina,
    ...(valutazione ? { valutazioneD2C: valutazione } : {}),
    dati: dati.map(serializzaFeedback),
  });
}

// POST /api/v1/feedback — registra il giudizio di un cliente finale.
//
// Body:
//   { partnerId? | riferimento?{sistema,idEsterno} | platformId? | negozio?+citta?,
//     voto (obbligatorio), scala?=5, canale?, idEsterno?, ordine?, cliente?,
//     commento?, motivi?: string[], data? (ISO, default adesso) }
//
// Idempotente: mandare due volte lo stesso `idEsterno` aggiorna quel feedback,
// non ne crea un secondo (le medie non si gonfiano per un retry).
export async function POST(req: NextRequest) {
  const client = await autentica(req, { feedback: true });
  if (client instanceof NextResponse) return client;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const sistema = nomeSistema(client.nome, typeof body.sistema === "string" ? body.sistema : undefined);

  const scala = Number(body.scala ?? body.votoMax ?? 5);
  const voto = normalizzaVoto(body.voto, scala);
  if (voto == null) {
    return erroreApi(400, `Voto non valido: atteso un numero fra 0 e ${isFinite(scala) ? scala : 5}`);
  }
  const votoOriginale = Number(String(body.voto).replace(",", "."));

  const dataGrezza = pulisci(body.data) ?? pulisci(body.dataFeedback);
  const dataFeedback = dataGrezza ? new Date(dataGrezza) : new Date();
  if (isNaN(dataFeedback.getTime())) {
    return erroreApi(400, `Data del feedback non valida: '${dataGrezza}'`);
  }

  // Motivi: si accettano solo i tag del catalogo (gli altri finiscono nel
  // commento). Un tag inventato falserebbe le analisi «perché sbagliano».
  let motivi: string[] = [];
  if ("motivi" in body) {
    if (!Array.isArray(body.motivi)) return erroreApi(400, "'motivi' deve essere una lista");
    motivi = [
      ...new Set(
        (body.motivi as unknown[])
          .map((m) => String(m).trim().toLowerCase())
          .filter((m) => (MOTIVI_FEEDBACK as readonly string[]).includes(m)),
      ),
    ];
  }

  const partnerId = await trovaPartner(body, client.nome);
  if (!partnerId) {
    return NextResponse.json(
      {
        ok: false,
        reason: "partner_non_trovato",
        aiuto:
          "Manda partnerId, oppure riferimento{sistema,idEsterno}, platformId o negozio+citta. Per agganciare senza id usa GET /api/v1/partners/match.",
      },
      { status: 404 },
    );
  }

  const dati = {
    partnerId,
    voto,
    votoOriginale: isFinite(votoOriginale) ? votoOriginale : null,
    scala: isFinite(scala) && scala >= 5 ? Math.round(scala) : 5,
    canale: pulisci(body.canale)?.toLowerCase() ?? null,
    sistema,
    ordine: pulisci(body.ordine) ?? pulisci(body.numeroOrdine),
    cliente: pulisci(body.cliente),
    commento: pulisci(body.commento) ?? pulisci(body.testo),
    motivi,
    dataFeedback,
  };

  const idEsterno = pulisci(body.idEsterno);
  // Se lo stesso feedback era già stato agganciato a un altro partner (correzione
  // a valle), va ricalcolata anche la pagella di quello vecchio.
  const precedente = idEsterno
    ? await prisma.feedbackD2C.findUnique({
        where: { sistema_idEsterno: { sistema, idEsterno } },
        select: { partnerId: true },
      })
    : null;
  const feedback = idEsterno
    ? await prisma.feedbackD2C.upsert({
        where: { sistema_idEsterno: { sistema, idEsterno } },
        create: { ...dati, idEsterno },
        update: dati,
      })
    : await prisma.feedbackD2C.create({ data: dati });

  if (precedente && precedente.partnerId !== partnerId) {
    await ricalcolaValutazioneD2C(precedente.partnerId);
  }
  const valutazione = await ricalcolaValutazioneD2C(partnerId);

  return NextResponse.json(
    { ok: true, feedback: serializzaFeedback(feedback), valutazioneD2C: valutazione },
    { status: 201 },
  );
}
