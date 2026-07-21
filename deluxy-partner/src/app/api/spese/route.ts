import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { nomeMese, MESI } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";

// API pubblica: gli ADDEBITI bancari (uscite) del periodo, aggregati per
// controparte, per la ricostruzione dei costi lato CFO.
//
//   GET /api/spese?anno=2026                 tutto l'anno
//   GET /api/spese?anno=2026&mese=6          un mese solo
//   GET /api/spese?anno=2026&dal=1&al=6      intervallo di mesi (inclusi)
//   GET /api/spese?anno=2026&stato=tutte     include anche le transazioni "ignorata"
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//
// Solo importi < 0 (uscite). Ogni controparte riporta l'uscita totale (valore
// assoluto), il numero di movimenti, la quota % e la ripartizione per mese.

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
  const includiIgnorate = (sp.get("stato") ?? "").toLowerCase() === "tutte";
  const query = `spese ${anno}${mese ? `/${mese}` : dal !== 1 || al !== 12 ? ` ${dal}-${al}` : ""}`;

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: appOrigine(req), queryPartner: query, esito: "non_autorizzato", ip: ipRichiesta(req) },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const meseDa = mese ?? Math.min(dal, al);
  const meseA = mese ?? Math.max(dal, al);
  // Finestra temporale [primo giorno di meseDa, primo giorno del mese dopo meseA)
  const inizio = new Date(Date.UTC(anno, meseDa - 1, 1));
  const fine = new Date(Date.UTC(anno, meseA, 1));

  const movimenti = await prisma.transazioneBancaria.findMany({
    where: {
      data: { gte: inizio, lt: fine },
      importo: { lt: 0 }, // solo uscite
      ...(includiIgnorate ? {} : { stato: { not: "ignorata" } }),
    },
    select: { data: true, importo: true, descrizione: true, controparte: true },
  });

  // aggregazione per controparte (fallback: descrizione)
  const perContro = new Map<
    string,
    { controparte: string; uscite: number; movimenti: number; perMese: number[] }
  >();
  for (const m of movimenti) {
    const k = (m.controparte?.trim() || m.descrizione?.trim() || "Senza controparte").slice(0, 120);
    const e = perContro.get(k) ?? { controparte: k, uscite: 0, movimenti: 0, perMese: Array(12).fill(0) };
    const uscita = Math.abs(m.importo);
    const meseIdx = m.data.getUTCMonth();
    e.uscite += uscita;
    e.movimenti += 1;
    e.perMese[meseIdx] += uscita;
    perContro.set(k, e);
  }

  const totaleUscite = [...perContro.values()].reduce((a, x) => a + x.uscite, 0);
  const controparti = [...perContro.values()]
    .sort((a, b) => b.uscite - a.uscite)
    .map((x) => ({
      controparte: x.controparte,
      uscite: +x.uscite.toFixed(2),
      movimenti: x.movimenti,
      quota: totaleUscite ? +((x.uscite / totaleUscite) * 100).toFixed(1) : 0,
      perMese: x.perMese.map((v) => +v.toFixed(2)),
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
      rispostaSintesi: `${controparti.length} controparti · uscite ${totaleUscite.toFixed(2)}`,
      ip: ipRichiesta(req),
    },
  });

  return NextResponse.json({
    anno,
    periodo: { dal: meseDa, al: meseA, etichetta: etichettaPeriodo },
    controparti,
    totali: {
      uscite: +totaleUscite.toFixed(2),
      movimenti: movimenti.length,
      perMese: Array.from({ length: 12 }, (_, i) =>
        +[...perContro.values()].reduce((a, x) => a + x.perMese[i], 0).toFixed(2)
      ),
    },
  });
}
