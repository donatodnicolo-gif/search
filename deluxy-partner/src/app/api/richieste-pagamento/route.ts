import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine } from "@/lib/apiauth";

// API delle richieste di pagamento IN ARRIVO dalle altre app (es. deluxy-messaging).
// Auth: header X-API-Key (la stessa chiave delle altre API pubbliche). L'app
// sorgente si identifica con X-App (finisce in `origine`).
//
//   POST /api/richieste-pagamento
//     body JSON: { importo (obbligatorio), beneficiario?, iban?, bic?, causale?,
//                  note?, contatto?, linkConversazione?, riferimento? }
//     → crea (o aggiorna, se non ancora decisa) una richiesta «in_attesa».
//       Idempotente per (origine, riferimento).
//
//   GET /api/richieste-pagamento?riferimento=…   → stato di una richiesta
//   GET /api/richieste-pagamento?stato=in_attesa → elenco (per l'app sorgente)

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  const origine = appOrigine(req) ?? "sconosciuta";
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }

  const importo = Number(String(body.importo ?? "").toString().replace(",", "."));
  if (!Number.isFinite(importo) || importo <= 0) {
    return NextResponse.json({ errore: "Campo 'importo' obbligatorio e maggiore di zero." }, { status: 400 });
  }
  const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const iban = body.iban ? String(body.iban).replace(/\s/g, "").toUpperCase() : null;
  const riferimentoEsterno = str(body.riferimento);

  // Idempotenza: stessa (origine, riferimento) già presente → aggiorna solo se
  // ancora in attesa (una richiesta già decisa non si tocca).
  if (riferimentoEsterno) {
    const esistente = await prisma.richiestaPagamentoIn.findUnique({
      where: { origine_riferimentoEsterno: { origine, riferimentoEsterno } },
    });
    if (esistente) {
      if (esistente.stato === "in_attesa") {
        const agg = await prisma.richiestaPagamentoIn.update({
          where: { id: esistente.id },
          data: {
            importo: +importo.toFixed(2),
            beneficiario: str(body.beneficiario),
            iban, bic: body.bic ? String(body.bic).replace(/\s/g, "").toUpperCase() : null,
            causale: str(body.causale), note: str(body.note),
            contatto: str(body.contatto), linkConversazione: str(body.linkConversazione),
          },
        });
        return NextResponse.json({ id: agg.id, stato: agg.stato, aggiornata: true });
      }
      return NextResponse.json({ id: esistente.id, stato: esistente.stato, aggiornata: false });
    }
  }

  const r = await prisma.richiestaPagamentoIn.create({
    data: {
      origine,
      riferimentoEsterno,
      importo: +importo.toFixed(2),
      beneficiario: str(body.beneficiario),
      iban,
      bic: body.bic ? String(body.bic).replace(/\s/g, "").toUpperCase() : null,
      causale: str(body.causale),
      note: str(body.note),
      contatto: str(body.contatto),
      linkConversazione: str(body.linkConversazione),
    },
  });
  return NextResponse.json({ id: r.id, stato: r.stato });
}

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida." }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const origine = appOrigine(req);
  const riferimento = sp.get("riferimento")?.trim();
  if (riferimento && origine) {
    const r = await prisma.richiestaPagamentoIn.findUnique({
      where: { origine_riferimentoEsterno: { origine, riferimentoEsterno: riferimento } },
    });
    if (!r) return NextResponse.json({ errore: "Richiesta non trovata." }, { status: 404 });
    return NextResponse.json({ id: r.id, stato: r.stato, importo: r.importo, decisoIl: r.decisoIl });
  }
  const richieste = await prisma.richiestaPagamentoIn.findMany({
    where: {
      ...(origine ? { origine } : {}),
      ...(sp.get("stato") ? { stato: sp.get("stato")! } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    richieste: richieste.map((r) => ({
      id: r.id, stato: r.stato, importo: r.importo, beneficiario: r.beneficiario,
      riferimento: r.riferimentoEsterno, decisoIl: r.decisoIl, createdAt: r.createdAt,
    })),
  });
}
