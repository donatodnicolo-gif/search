import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { accodaOperazione } from "@/lib/operazioni";
import { registra } from "@/lib/registro";
import { MODIFICHE_CHE_PESANO, validaModifica } from "@/lib/guardrail";

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
      // ⚠️ Le PROGRAMMATE non si consegnano prima del loro giorno. Il filtro
      // sta qui, nel punto in cui lo script viene a prendersi il lavoro:
      // così vale per qualunque copia dello script, anche quelle vecchie, e
      // non serve reincollare niente perché la programmazione funzioni.
      OR: [{ daEseguireDal: null }, { daEseguireDal: { lte: new Date() } }],
    },
    orderBy: { approvataIl: "asc" },
    take: 50,
  });

  // Il nome della campagna serve allo script per cercare il bersaglio nel posto
  // giusto invece che in tutto l'account. `OperazioneAdv` non ha la relazione,
  // solo `campagnaId`: si prendono in **una query sola** per tutte le righe —
  // una per riga qui sarebbe cinquanta andate e ritorno su Postgres remoto.
  const idCampagne = [...new Set(operazioni.map((o) => o.campagnaId).filter((x): x is string => !!x))];
  const nomeCampagna = new Map(
    idCampagne.length > 0
      ? (
          await prisma.campagna.findMany({
            where: { id: { in: idCampagne } },
            select: { id: true, nome: true },
          })
        ).map((c) => [c.id, c.nome])
      : []
  );

  return NextResponse.json({
    operazioni: operazioni.map((o) => ({
      id: o.id,
      tipo: o.tipo,
      // ⚠️ `account` NON veniva mandato, e senza di lui tutta la logica che lo
      // script ha già per distinguere «non è roba mia» da «è roba mia e non la
      // trovo» restava spenta: `op.account` era sempre undefined, quindi ogni
      // bersaglio non trovato finiva fra le **saltate** e non tornava nessun
      // esito. È la seconda metà della correzione dell'08/08/2026 — riempire
      // il campo nel database senza mandarlo qui non serviva a niente.
      account: o.account,
      // La campagna a cui l'operazione appartiene: permette una ricerca esatta
      // (campagna + gruppo + testo) invece di una per solo testo su tutto
      // l'account, che è quella che non ha mai funzionato.
      campagna: o.campagnaId ? nomeCampagna.get(o.campagnaId) ?? null : null,
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

  // Se l'operazione tocca una campagna nota, valgono i guardrail del doc 11 —
  // che dal 04/08/2026 avvisano invece di rifiutare.
  const avvisi: string[] = [];
  if (body.campagnaId) {
    const campagna = await prisma.campagna.findUnique({
      where: { id: String(body.campagnaId) },
      include: {
        modifiche: MODIFICHE_CHE_PESANO,
        incidenti: { where: { stato: "aperto" }, select: { codice: true } },
      },
    });
    if (!campagna) return erroreApi(404, "Campagna non trovata");
    const esito = validaModifica({
      classe: campagna.classe,
      livello: body.livello ?? "L1",
      deltaBudgetPct: body.deltaBudgetPct != null ? Number(body.deltaBudgetPct) : null,
      rollbackPiano: body.rollbackPiano ?? null,
      ultimaModifica: campagna.modifiche[0]?.eseguitaIl ?? null,
    });
    // Niente più 409: il change control avvisa e l'avviso viaggia con
    // l'operazione fino a chi approva. Vale anche per l'incidente aperto.
    avvisi.push(...esito.avvisi);
    if (campagna.incidenti.length > 0) {
      avvisi.push(
        `Incidente ${campagna.incidenti[0].codice} APERTO su questa campagna: finché non è chiuso, quello che si misura è sporcato dal guasto.`
      );
    }
  }

  const operazione = await accodaOperazione({
    data: {
      tipo: String(body.tipo),
      canale: body.canale ?? "google_ads",
      account: body.account ?? null,
      bersaglio: String(body.bersaglio),
      idEsterno: body.idEsterno ? String(body.idEsterno) : null,
      parametri: body.parametri ? JSON.stringify(body.parametri) : null,
      motivo: body.motivo ?? null,
      avvisi: avvisi.length > 0 ? avvisi.join(" · ") : null,
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
