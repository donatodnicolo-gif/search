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
    include: { tipologia: true, partner: { select: { nome: true } } },
  });

  // ---- Dettaglio di una tipologia: le fatture, non la somma ----
  // Simmetrico a `?controparte=` su /api/spese. Un totale per tipologia dice
  // quanto, non **di chi**: chi guarda un ricavo che non torna ha bisogno delle
  // fatture che lo compongono, col partner e il numero.
  const chiediTipologia = (sp.get("tipologia") ?? "").trim();
  if (chiediTipologia) {
    const righe = fatture
      .filter((f) => f.tipologia.nome.toLowerCase() === chiediTipologia.toLowerCase())
      .sort((a, b) => b.mese - a.mese || b.imponibile - a.imponibile)
      .map((f) => ({
        numero: f.numero,
        mese: f.mese,
        emissione: f.emissione ? f.emissione.toISOString().slice(0, 10) : null,
        partner: f.partner?.nome ?? null,
        imponibile: +f.imponibile.toFixed(2),
        totale: +ivato(f).toFixed(2),
        pagata: f.pagata,
        descrizione: f.descrizione ?? null,
      }));
    return NextResponse.json({
      anno,
      tipologia: chiediTipologia,
      periodo: { dal: mese ?? Math.min(dal, al), al: mese ?? Math.max(dal, al) },
      fatture: righe,
      totale: +righe.reduce((s, r) => s + r.imponibile, 0).toFixed(2),
    });
  }

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

  // ---- Tutto l'anno mese per mese, in una chiamata sola ----
  // Chi costruisce un conto economico mensile ha bisogno dei dodici mesi: senza
  // questo deve chiedere dodici volte lo stesso periodo cambiando `mese`, e
  // sono dodici viaggi di rete per disegnare una riga di tabella.
  if ((sp.get("raggruppa") ?? "").toLowerCase() === "mese") {
    const perTipMese = new Map<string, number[]>();
    for (const f of fatture) {
      const k = f.tipologia.nome;
      const arr = perTipMese.get(k) ?? Array(12).fill(0);
      arr[f.mese - 1] += f.imponibile;
      perTipMese.set(k, arr);
    }
    return NextResponse.json({
      anno,
      periodo: { dal: mese ?? Math.min(dal, al), al: mese ?? Math.max(dal, al) },
      tipologie: [...perTipMese.entries()].map(([tipologia, mesi]) => ({
        tipologia,
        mesi: mesi.map((v) => +v.toFixed(2)),
        imponibile: +mesi.reduce((a, b) => a + b, 0).toFixed(2),
      })),
      totali: {
        mesi: Array.from({ length: 12 }, (_, i) =>
          +[...perTipMese.values()].reduce((a, x) => a + x[i], 0).toFixed(2)
        ),
      },
    });
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
