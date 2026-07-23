import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { STATI_AZIONE_APERTI } from "@/lib/dominio";

// GET /api/v1/stato — riassunto rapido per le sessioni Claude a inizio lavoro:
// azioni aperte/scadute per brand, ultime analisi, campagne vive, spesa 7 gg.
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorni7 = new Date(oggi.getTime() - 6 * 86_400_000);

  const [aperte, scadute, ultimeAnalisi, campagne, metriche7, alertAperti, incidentiAperti, incongruenzeP0, lezioniAttive, fatteNonVerificate] = await Promise.all([
    prisma.azione.groupBy({
      by: ["brand"],
      where: { stato: { in: STATI_AZIONE_APERTI } },
      _count: { _all: true },
    }),
    prisma.azione.findMany({
      where: { stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } },
      select: { id: true, titolo: true, brand: true, stato: true, scadenza: true, owner: true },
      orderBy: { scadenza: "asc" },
    }),
    prisma.analisi.findMany({
      orderBy: { dataAnalisi: "desc" },
      take: 10,
      select: { id: true, titolo: true, tipo: true, brand: true, esito: true, dataAnalisi: true },
    }),
    prisma.campagna.findMany({
      where: { stato: { in: ["attiva", "in_apprendimento", "in_pausa"] } },
      select: { id: true, nome: true, brand: true, canale: true, stato: true, budgetGiornaliero: true },
    }),
    prisma.metricaCampagna.aggregate({
      where: { data: { gte: giorni7 } },
      _sum: { spesa: true, conversioni: true, ricavi: true },
    }),
    prisma.alert.findMany({
      where: { stato: "aperto", creatoIl: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      include: { campagna: { select: { id: true, nome: true, classe: true } } },
      orderBy: { creatoIl: "desc" },
    }),
    prisma.incidente.findMany({
      where: { stato: "aperto" },
      select: { codice: true, titolo: true, oggetti: true, campagnaId: true },
    }),
    prisma.incongruenza.findMany({
      where: { stato: "aperta", priorita: "P0" },
      select: { documento: true, dice: true, risulta: true },
    }),
    prisma.memoriaVoce.findMany({
      where: { stato: "attiva" },
      orderBy: { data: "desc" },
      take: 20,
      select: { data: true, sezione: true, brand: true, testo: true },
    }),
    prisma.azione.findMany({
      where: { stato: "fatta", verificataIl: null, fattoIl: { not: null } },
      select: { id: true, titolo: true, fattoIl: true },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    azioniAperte: aperte.map((r) => ({ brand: r.brand, n: r._count._all })),
    azioniScadute: scadute,
    ultimeAnalisi,
    campagneVive: campagne,
    // Guardrail (doc 11 e 00.x): quello che una sessione DEVE sapere prima di toccare qualcosa
    guardrail: {
      alertAperti,
      incidentiAperti,
      incongruenzeP0Aperte: incongruenzeP0,
      azioniFatteNonVerificate: fatteNonVerificate,
    },
    lezioniRecenti: lezioniAttive,
    ultimi7Giorni: {
      spesa: metriche7._sum.spesa ?? 0,
      conversioni: metriche7._sum.conversioni ?? 0,
      ricavi: metriche7._sum.ricavi ?? 0,
    },
  });
}
