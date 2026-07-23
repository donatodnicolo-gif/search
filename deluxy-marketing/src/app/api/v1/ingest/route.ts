import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// POST /api/v1/ingest — porta d'ingresso unica per le piattaforme pubblicitarie.
// Pensata per chi manda dati senza conoscere gli id interni dell'app: le
// campagne si riconoscono (o si creano) dall'id della piattaforma, e le
// metriche si aggiornano per giorno. Idempotente: rimandare gli stessi giorni
// aggiorna i valori invece di duplicarli.
//
// La usa lo script di Google Ads (scripts/google-ads-script.js) e può usarla
// qualsiasi altra fonte: Meta, TikTok, un foglio, una sessione Claude.
//
// Body: {
//   canale?: "google_ads" | "meta_ads" | "tiktok",   (default google_ads)
//   brand?: "flowers" | "cake" | "gifts" | "cross",  (default: dedotto dal nome)
//   account?: "825-518-1560",                        (solo per il registro)
//   righe: [{
//     idCampagna*: "21489...",   nome*: "[Deluxy] Fiori Milano",
//     data*: "2026-07-22",       spesa?, impression?, click?, conversioni?, ricavi?,
//     stato?: "attiva" | "in_pausa", budgetGiornaliero?
//   }]
// }
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
  if (righe.length === 0) return erroreApi(400, "Nessuna riga da importare");

  const canale = body.canale ?? "google_ads";
  const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));

  // Brand dedotto dal nome della campagna quando non è dichiarato: i nomi
  // Deluxy portano già il marchio (es. "[Deluxyflowers] ITALIAN-ENG").
  const brandDa = (nome: string): string => {
    const t = nome.toLowerCase();
    if (body.brand) return body.brand;
    if (/deluxyflower|flowers/.test(t)) return "flowers";
    if (/cake/.test(t)) return "cake";
    if (/deluxy|gifts|regali/.test(t)) return "gifts";
    return "cross";
  };

  let campagneCreate = 0;
  let metricheSalvate = 0;
  const nonValide: string[] = [];

  for (const r of righe) {
    if (!r?.idCampagna || !r?.nome || !r?.data) {
      nonValide.push(JSON.stringify(r).slice(0, 80));
      continue;
    }
    const idEsterno = String(r.idCampagna);
    const giorno = new Date(r.data);
    if (isNaN(giorno.getTime())) {
      nonValide.push(String(r.data));
      continue;
    }
    giorno.setUTCHours(0, 0, 0, 0);

    // La campagna si riconosce dall'id di piattaforma; se non c'è, si crea.
    let campagna = await prisma.campagna.findFirst({ where: { idEsterno, canale } });
    if (!campagna) {
      // Può esistere già col solo nome (censita a mano o dal seed dei Definitivi):
      // in quel caso le si aggancia l'id invece di crearne una doppia.
      campagna = await prisma.campagna.findFirst({ where: { nome: String(r.nome), canale } });
      if (campagna) {
        campagna = await prisma.campagna.update({ where: { id: campagna.id }, data: { idEsterno } });
      } else {
        campagna = await prisma.campagna.create({
          data: {
            nome: String(r.nome),
            idEsterno,
            canale,
            brand: brandDa(String(r.nome)),
            stato: r.stato ?? "attiva",
            budgetGiornaliero: numero(r.budgetGiornaliero),
            note: `Creata automaticamente dall'import ${canale}${body.account ? ` (account ${body.account})` : ""}`,
          },
        });
        campagneCreate++;
      }
    } else if (r.stato || r.budgetGiornaliero != null) {
      await prisma.campagna.update({
        where: { id: campagna.id },
        data: {
          ...(r.stato ? { stato: r.stato } : {}),
          ...(r.budgetGiornaliero != null ? { budgetGiornaliero: numero(r.budgetGiornaliero) } : {}),
        },
      });
    }

    const valori = {
      spesa: numero(r.spesa),
      impression: numero(r.impression) != null ? Math.round(numero(r.impression)!) : null,
      click: numero(r.click) != null ? Math.round(numero(r.click)!) : null,
      conversioni: numero(r.conversioni),
      ricavi: numero(r.ricavi),
    };
    await prisma.metricaCampagna.upsert({
      where: { campagnaId_data: { campagnaId: campagna.id, data: giorno } },
      create: { campagnaId: campagna.id, data: giorno, ...valori },
      update: valori,
    });
    metricheSalvate++;
  }

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "metrica",
    titolo: `Import ${canale}${body.account ? ` da account ${body.account}` : ""}`,
    dettaglio: `${metricheSalvate} giorni-campagna · ${campagneCreate} campagne nuove${nonValide.length ? ` · ${nonValide.length} righe scartate` : ""}`,
  });

  return NextResponse.json(
    { metricheSalvate, campagneCreate, righeScartate: nonValide.length },
    { status: 201 }
  );
}
