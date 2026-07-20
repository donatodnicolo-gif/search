import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { ivato, nomeMese, MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";

// API pubblica: totali dei servizi a fatturazione aggregati PER TIPOLOGIA,
// su un periodo scelto.
//
//   GET /api/tipologie?anno=2026                 tutto l'anno
//   GET /api/tipologie?anno=2026&mese=6          un mese solo
//   GET /api/tipologie?anno=2026&dal=1&al=6      intervallo di mesi (inclusi)
//   GET /api/tipologie?anno=2026&stato=pagate    solo saldate | aperte | tutte(default)
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//   Header: X-App: <nome-app>     (facoltativo, per lo storico)
//
// Ogni voce riporta imponibile (netto IVA), iva, totale (IVA inclusa), numero
// fatture e quota % sul totale del periodo. Ordinato per imponibile decrescente.

function meseValido(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v);
  return n >= 1 && n <= 12 ? n : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anno = parseInt(sp.get("anno") ?? "") || ANNO_CORRENTE;
  const mese = meseValido(sp.get("mese"));
  const dal = meseValido(sp.get("dal")) ?? 1;
  const al = meseValido(sp.get("al")) ?? 12;
  const stato = (sp.get("stato") ?? "tutte").toLowerCase();
  const query = `tipologie ${anno}${mese ? `/${mese}` : dal !== 1 || al !== 12 ? ` ${dal}-${al}` : ""}`;

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: appOrigine(req), queryPartner: query, esito: "non_autorizzato", ip: ipRichiesta(req) },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  // periodo: un mese preciso oppure l'intervallo dal..al
  const meseFiltro = mese ? { mese } : { mese: { gte: Math.min(dal, al), lte: Math.max(dal, al) } };
  const statoFiltro =
    stato === "pagate" ? { pagata: true } : stato === "aperte" ? { pagata: false } : {};

  const fatture = await prisma.fatturaServizio.findMany({
    where: { anno, imponibile: { gt: 0 }, ...meseFiltro, ...statoFiltro },
    include: { tipologia: true },
  });

  // aggregazione per tipologia
  const perTip = new Map<
    string,
    { tipologia: string; imponibile: number; iva: number; totale: number; fatture: number }
  >();
  for (const f of fatture) {
    const k = f.tipologia.nome;
    const e = perTip.get(k) ?? { tipologia: k, imponibile: 0, iva: 0, totale: 0, fatture: 0 };
    const tot = ivato(f);
    e.imponibile += f.imponibile;
    e.iva += tot - f.imponibile;
    e.totale += tot;
    e.fatture += 1;
    perTip.set(k, e);
  }

  const totaleImponibile = [...perTip.values()].reduce((a, x) => a + x.imponibile, 0);
  const tipologie = [...perTip.values()]
    .sort((a, b) => b.imponibile - a.imponibile)
    .map((x) => ({
      tipologia: x.tipologia,
      imponibile: +x.imponibile.toFixed(2),
      iva: +x.iva.toFixed(2),
      totale: +x.totale.toFixed(2),
      fatture: x.fatture,
      quota: totaleImponibile ? +((x.imponibile / totaleImponibile) * 100).toFixed(1) : 0,
    }));

  const etichettaPeriodo = mese
    ? `${nomeMese(mese)} ${anno}`
    : dal === 1 && al === 12
      ? `Anno ${anno}`
      : `${MESI[Math.min(dal, al) - 1]}–${MESI[Math.max(dal, al) - 1]} ${anno}`;

  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      esito: "trovato",
      rispostaSintesi: `${tipologie.length} tipologie · imponibile ${totaleImponibile.toFixed(2)}`,
      ip: ipRichiesta(req),
    },
  });

  return NextResponse.json({
    anno,
    periodo: { dal: mese ?? Math.min(dal, al), al: mese ?? Math.max(dal, al), etichetta: etichettaPeriodo },
    stato: stato === "pagate" ? "solo saldate" : stato === "aperte" ? "solo aperte" : "tutte",
    tipologie,
    totali: {
      imponibile: +totaleImponibile.toFixed(2),
      iva: +[...perTip.values()].reduce((a, x) => a + x.iva, 0).toFixed(2),
      totale: +[...perTip.values()].reduce((a, x) => a + x.totale, 0).toFixed(2),
      fatture: fatture.length,
    },
  });
}
