import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { commissione } from "@/lib/calc";
import { ANNO_CORRENTE } from "@/lib/queries";

// API pubblica: le **vendite dei partner vendor** dell'anno, mese per mese, con
// la commissione calcolata sulla fee di ciascun partner.
//
//   GET /api/vendor?anno=2026
//   Header: X-API-Key: <chiave>
//
// A cosa serve: il ricavo dell'ecommerce non è una percentuale unica del
// venduto. Su quello che passa dai partner Deluxy fattura una **fee sua**, che
// è scritta partner per partner (dal 15% al 25%) — e questa API la restituisce
// applicata vendita per vendita, invece di far indovinare una media a chi
// consuma. Il resto del venduto, quello eseguito comprando dai fornitori, si
// ricava per differenza da chi conosce l'incasso totale (il registro ordini).
//
// `righe` e `partner` servono a capire se un mese è **caricato**: le vendite si
// inseriscono a mano, e un mese senza righe non è un mese senza vendite — è un
// mese non ancora caricato. Chi legge deve poterlo distinguere, altrimenti
// scrive «ricavo zero» dove c'è solo un dato mancante.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const anno = parseInt(sp.get("anno") ?? "") || ANNO_CORRENTE;

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: appOrigine(req), queryPartner: `vendor ${anno}`, esito: "non_autorizzato", ip: ipRichiesta(req) },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const vendite = await prisma.venditaVendor.findMany({
    where: { anno },
    select: { mese: true, incassoLordo: true, feePercent: true, partnerId: true },
  });

  const venduto = Array(12).fill(0) as number[];
  const commissioni = Array(12).fill(0) as number[];
  const righe = Array(12).fill(0) as number[];
  const partnerMese: Set<string>[] = Array.from({ length: 12 }, () => new Set<string>());
  for (const v of vendite) {
    const i = v.mese - 1;
    if (i < 0 || i > 11) continue;
    venduto[i] += v.incassoLordo;
    commissioni[i] += commissione(v);
    righe[i] += 1;
    partnerMese[i].add(v.partnerId);
  }

  const tot = (a: number[]) => +a.reduce((x, y) => x + y, 0).toFixed(2);

  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: `vendor ${anno}`,
      esito: "trovato",
      rispostaSintesi: `${vendite.length} vendite · venduto ${tot(venduto)} · commissioni ${tot(commissioni)}`,
      ip: ipRichiesta(req),
    },
  });

  return NextResponse.json({
    anno,
    mesi: venduto.map((_, i) => ({
      mese: i + 1,
      venduto: +venduto[i].toFixed(2),
      commissioni: +commissioni[i].toFixed(2),
      righe: righe[i],
      partner: partnerMese[i].size,
    })),
    totali: {
      venduto: tot(venduto),
      commissioni: tot(commissioni),
      righe: vendite.length,
      partner: new Set(vendite.map((v) => v.partnerId)).size,
    },
  });
}
