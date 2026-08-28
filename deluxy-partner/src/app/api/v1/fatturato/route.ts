import { NextRequest, NextResponse } from "next/server";
import { chiaveApiValida } from "@/lib/apiauth";
import { prisma } from "@/lib/db";
import { capogruppoDalRegistro } from "@/lib/anagrafiche";

// GET /api/v1/fatturato?gruppo=<idCapogruppo>
//
// Quanto fattura con noi un CLIENTE in tutte le sue aziende. Il registro
// possiede gli AGGANCI (quali aziende compongono il capogruppo); FINANCE
// possiede gli IMPORTI e li somma. È la risposta alla domanda del 27/08: «Scout
// deve dirci quanto fattura quell'entità con noi in tutte le sue società».
//
// ⚠️⚠️ LA RISPOSTA DICHIARA LA PROPRIA BASE. Un totale che non dice cosa NON ha
// contato mente: il caso vero è CHANEL, tre schede per 138.595 €, una delle
// quali (CHANEL ROMA, 52.600 €) non è agganciata al registro — sommando solo le
// agganciate escono 85.994 €, sbagliati del 38%. Perciò qui tornano anche le
// schede SOSPETTE PERSE (stesso gruppo di pagamento, ma senza `anagraficaId`) e
// un avviso su ciò che resta fuori a monte (il riversamento da Orders).
export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req, "lettura"))) {
    return NextResponse.json({ errore: "Chiave non valida" }, { status: 401 });
  }
  const gruppoId = req.nextUrl.searchParams.get("gruppo")?.trim();
  if (!gruppoId) return NextResponse.json({ errore: "Manca ?gruppo=<id>" }, { status: 400 });

  const capo = await capogruppoDalRegistro(gruppoId);
  if (!capo) {
    // Registro spento o capogruppo inesistente: NON si risponde 0 (sarebbe una
    // bugia), si dice che non si sa.
    return NextResponse.json(
      { errore: "Capogruppo non leggibile dal registro (spento o id inesistente)" },
      { status: 502 },
    );
  }

  const ids = capo.anagraficheIds ?? [];
  // Le schede di FINANCE che sono quelle aziende: per aggancio principale e per
  // sede secondaria (`AnagraficaCollegata`).
  const [principali, collegate] = await Promise.all([
    ids.length ? prisma.partner.findMany({ where: { anagraficaId: { in: ids } }, select: { id: true, nome: true } }) : [],
    ids.length ? prisma.anagraficaCollegata.findMany({ where: { anagraficaId: { in: ids } }, select: { partnerId: true } }) : [],
  ]);
  const partnerIds = [...new Set([...principali.map((p) => p.id), ...collegate.map((c) => c.partnerId)])];

  const schede = partnerIds.length
    ? await prisma.partner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, nome: true },
      })
    : [];

  // Gli importi: fatture servizi (imponibile) + vendite vendor (incasso lordo).
  const [fatture, vendite] = await Promise.all([
    partnerIds.length
      ? prisma.fatturaServizio.groupBy({ by: ["partnerId"], where: { partnerId: { in: partnerIds } }, _sum: { imponibile: true } })
      : [],
    partnerIds.length
      ? prisma.venditaVendor.groupBy({ by: ["partnerId"], where: { partnerId: { in: partnerIds } }, _sum: { incassoLordo: true } })
      : [],
  ]);
  const mF = new Map(fatture.map((f) => [f.partnerId, f._sum.imponibile ?? 0]));
  const mV = new Map(vendite.map((v) => [v.partnerId, v._sum.incassoLordo ?? 0]));

  const perScheda = schede.map((s) => ({
    id: s.id,
    nome: s.nome,
    fatture: Math.round(mF.get(s.id) ?? 0),
    vendite: Math.round(mV.get(s.id) ?? 0),
    totale: Math.round((mF.get(s.id) ?? 0) + (mV.get(s.id) ?? 0)),
  }));
  const totale = perScheda.reduce((a, s) => a + s.totale, 0);

  // ⚠️ SCHEDE SOSPETTE PERSE: in FINANCE hanno il gruppo di pagamento uguale al
  // nome del capogruppo ma NON sono agganciate al registro. Non le sommo (non
  // so se sono davvero di questo cliente), ma le dico: è il caso CHANEL ROMA.
  const sospette = await prisma.partner.findMany({
    where: { gruppo: { equals: capo.nome, mode: "insensitive" }, anagraficaId: null },
    select: { id: true, nome: true, gruppo: true },
  });

  return NextResponse.json({
    gruppo: { id: capo.id, nome: capo.nome },
    totale,
    imponibileFatture: perScheda.reduce((a, s) => a + s.fatture, 0),
    incassoVendite: perScheda.reduce((a, s) => a + s.vendite, 0),
    schede: perScheda,
    // La base del totale: quante schede, da quali fonti, e cosa manca.
    base: {
      aziendeNelCapogruppo: capo.aziende.length,
      schedeContate: perScheda.length,
      fonti: ["FatturaServizio.imponibile", "VenditaVendor.incassoLordo"],
      // ⚠️ Queste NON sono nel totale: agganciarle è un gesto di una persona.
      sospettePerse: sospette.map((s) => ({ id: s.id, nome: s.nome })),
      // ⚠️ A monte: il fatturato e-commerce (Orders) non è ancora riversato in
      // FINANCE (deciso il 26/08, da costruire). «Fatturato» qui = ciò che
      // FINANCE vede: fatture servizi + vendite vendor.
      avvertenza:
        "Totale di ciò che FINANCE registra (fatture servizi + vendite vendor). Il riversamento da Orders non è ancora costruito.",
    },
  });
}
