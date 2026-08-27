import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { riepilogoCensimento, salvaCensimento } from "@/lib/censimento-storico";

// IL CENSIMENTO STORICO DELLE CAMPAGNE — porta d'ingresso e lettura.
//
// POST /api/v1/censimento  (chiave con SCRITTURA)
//   Body: {
//     canale?: "google_ads" | "meta_ads",   (default google_ads)
//     account*: "825-518-1560",
//     brand?: "flowers" | "cake" | "gifts",
//     righe*: [{ idEsterno*, nome*, anno*, stato?, tipo?, spesa?, impression?,
//                click?, conversioni?, ricavi?, primoMese?, ultimoMese?,
//                mesiAttivi? }]
//   }
//   Una riga per campagna per ANNO. La manda lo script ad hoc
//   `scripts/google-ads-censimento-storico.js`, incollato una volta per account.
//
// GET /api/v1/censimento?anno=&canale=  (qualsiasi chiave)
//   Il riepilogo: quante campagne per anno, quanto hanno speso, quali l'app
//   non ha mai visto.
//
// ⚠️ La scrittura chiede `scrittura: true` come tutte le rotte che toccano il
// database: una chiave di sola lettura non deve poter riscrivere un censimento.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const righe = Array.isArray(body.righe) ? body.righe : [];
  if (righe.length === 0) return erroreApi(400, "Nessuna riga da censire: serve 'righe'");
  if (!body.account) return erroreApi(400, "Manca 'account': senza non si sa di chi sono le campagne");

  const esito = await salvaCensimento(righe, {
    canale: body.canale,
    account: String(body.account),
    brand: body.brand,
  });

  return NextResponse.json({
    ...esito,
    // ⚠️ Le scartate si dicono SEMPRE, col motivo: un censimento a metà letto
    // come completo trasforma «non c'è» in un'affermazione falsa.
    messaggio:
      `${esito.campagne} campagne · ${esito.salvate} righe salvate` +
      (esito.scartate ? ` · ${esito.scartate} scartate` : "") +
      (esito.anni.length ? ` · anni ${esito.anni.join(", ")}` : ""),
  });
}

export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const anno = p.get("anno") ? Number(p.get("anno")) : undefined;
  const riepilogo = await riepilogoCensimento({
    anno: Number.isInteger(anno) ? anno : undefined,
    canale: p.get("canale") ?? undefined,
  });
  return NextResponse.json({
    totaleCampagne: riepilogo.totaleCampagne,
    maiVisteDallApp: riepilogo.mai,
    spesaTotale: Math.round(riepilogo.spesaTotale),
    perAnno: riepilogo.perAnno,
    ultimaCorsa: riepilogo.ultimaCorsa?.ricevutoIl ?? null,
    campagne: riepilogo.voci,
  });
}
