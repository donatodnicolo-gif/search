import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/spesa — quanto si spende DAVVERO in campagne, per le altre app
// Deluxy (Budgets, Partner, Hub). Basta una chiave di sola lettura.
//
// "Davvero" vuol dire: la spesa che le piattaforme hanno addebitato, giorno per
// giorno, non il budget pianificato. Ma un numero del genere è pericoloso se
// arriva senza contesto: se un account non manda dati, il totale è più basso
// del vero e chi legge non ha modo di saperlo. Per questo ogni risposta porta
// con sé un blocco "copertura" che dichiara quali account stanno alimentando
// il dato, fino a quando, e quali tacciono. Chi consuma questa API deve
// guardare `copertura.completa` prima di usare `totale` per decidere.
//
// Parametri (tutti opzionali):
//   dal, al      AAAA-MM-GG (default: ultimi 30 giorni, al = oggi)
//   brand        flowers | cake | gifts | cross
//   canale       google_ads | meta_ads | tiktok
//   raggruppa    giorno | mese | brand | canale | campagna  (default: nessuno)
//
// Esempi:
//   /api/v1/spesa?dal=2026-07-01&al=2026-07-31
//   /api/v1/spesa?raggruppa=mese&brand=gifts
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const q = req.nextUrl.searchParams;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const oggi = new Date();
  oggi.setUTCHours(0, 0, 0, 0);

  const alStr = q.get("al") ?? iso(oggi);
  const dalStr = q.get("dal") ?? iso(new Date(oggi.getTime() - 30 * 86_400_000));
  const dal = new Date(dalStr);
  const al = new Date(alStr);
  if (isNaN(dal.getTime()) || isNaN(al.getTime())) {
    return erroreApi(400, "Date non valide: usa il formato AAAA-MM-GG");
  }
  dal.setUTCHours(0, 0, 0, 0);
  al.setUTCHours(0, 0, 0, 0);
  const alEsclusivo = new Date(al.getTime() + 86_400_000); // "al" incluso

  const brand = q.get("brand") ?? undefined;
  const canale = q.get("canale") ?? undefined;
  const raggruppa = q.get("raggruppa") ?? undefined;

  const filtroCampagna = {
    ...(brand ? { brand } : {}),
    ...(canale ? { canale } : {}),
  };

  const metriche = await prisma.metricaCampagna.findMany({
    where: { data: { gte: dal, lt: alEsclusivo }, campagna: filtroCampagna },
    select: {
      data: true,
      spesa: true,
      conversioni: true,
      ricavi: true,
      click: true,
      campagna: { select: { id: true, nome: true, brand: true, canale: true, idEsterno: true } },
    },
  });

  let totale = 0;
  let conversioni = 0;
  let ricavi = 0;
  let click = 0;
  const gruppi = new Map<string, { chiave: string; etichetta: string; spesa: number; conversioni: number; ricavi: number }>();

  const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  for (const m of metriche) {
    const s = m.spesa ?? 0;
    totale += s;
    conversioni += m.conversioni ?? 0;
    ricavi += m.ricavi ?? 0;
    click += m.click ?? 0;

    if (!raggruppa) continue;
    let chiave: string;
    let etichetta: string;
    if (raggruppa === "giorno") {
      chiave = m.data.toISOString().slice(0, 10);
      etichetta = chiave;
    } else if (raggruppa === "mese") {
      chiave = m.data.toISOString().slice(0, 7);
      etichetta = `${MESI[m.data.getUTCMonth()]} ${m.data.getUTCFullYear()}`;
    } else if (raggruppa === "brand") {
      chiave = m.campagna.brand;
      etichetta = m.campagna.brand;
    } else if (raggruppa === "canale") {
      chiave = m.campagna.canale;
      etichetta = m.campagna.canale;
    } else if (raggruppa === "campagna") {
      chiave = m.campagna.id;
      etichetta = m.campagna.nome;
    } else {
      continue;
    }
    const g = gruppi.get(chiave) ?? { chiave, etichetta, spesa: 0, conversioni: 0, ricavi: 0 };
    g.spesa += s;
    g.conversioni += m.conversioni ?? 0;
    g.ricavi += m.ricavi ?? 0;
    gruppi.set(chiave, g);
  }

  // ---------- Copertura: di cosa ci si può fidare ----------
  // Chi alimenta il dato in questo periodo, e fino a quando.
  const perAccount = new Map<string, { canale: string; brand: string; giorni: Set<string>; ultimo: Date | null; spesa: number }>();
  for (const m of metriche) {
    const k = `${m.campagna.canale}|${m.campagna.brand}`;
    const a = perAccount.get(k) ?? { canale: m.campagna.canale, brand: m.campagna.brand, giorni: new Set<string>(), ultimo: null, spesa: 0 };
    a.giorni.add(m.data.toISOString().slice(0, 10));
    if (!a.ultimo || m.data > a.ultimo) a.ultimo = m.data;
    a.spesa += m.spesa ?? 0;
    perAccount.set(k, a);
  }

  const accountCensiti = await prisma.accountAdv.findMany({
    where: {
      attivo: true,
      piattaforma: { in: ["google_ads", "meta_ads", "tiktok"] },
      ...(brand ? { brand } : {}),
      ...(canale ? { piattaforma: canale } : {}),
    },
    select: { nome: true, idEsterno: true, piattaforma: true, brand: true },
  });

  const alimentano = [...perAccount.values()].map((a) => ({
    canale: a.canale,
    brand: a.brand,
    spesa: Math.round(a.spesa * 100) / 100,
    giorniConDati: a.giorni.size,
    ultimoGiorno: a.ultimo ? a.ultimo.toISOString().slice(0, 10) : null,
  }));

  const chiaviAttive = new Set(alimentano.map((a) => `${a.canale}|${a.brand}`));
  const silenziosi = accountCensiti
    .filter((a) => !chiaviAttive.has(`${a.piattaforma}|${a.brand}`))
    .map((a) => ({
      canale: a.piattaforma,
      brand: a.brand,
      account: a.idEsterno,
      nome: a.nome,
      motivo: "nessuna metrica nel periodo: il connettore non è attivo su questo account, o non ha girato",
    }));

  // Quanti giorni del periodo hanno almeno un dato: un buco in mezzo abbassa
  // il totale tanto quanto un account muto.
  const giorniRichiesti = Math.round((alEsclusivo.getTime() - dal.getTime()) / 86_400_000);
  const giorniCoperti = new Set(metriche.map((m) => m.data.toISOString().slice(0, 10))).size;
  const ultimoGiornoDato = alimentano.reduce<string | null>(
    (max, a) => (a.ultimoGiorno && (!max || a.ultimoGiorno > max) ? a.ultimoGiorno : max),
    null
  );

  const completa = silenziosi.length === 0 && giorniCoperti >= giorniRichiesti - 1;
  const avvertenze: string[] = [];
  if (silenziosi.length > 0) {
    avvertenze.push(
      `${silenziosi.length} account censiti non hanno dati nel periodo (${silenziosi.map((s) => `${s.brand}/${s.canale}`).join(", ")}): la spesa reale complessiva è più alta di questo totale.`
    );
  }
  if (giorniCoperti < giorniRichiesti - 1) {
    avvertenze.push(
      `Solo ${giorniCoperti} dei ${giorniRichiesti} giorni richiesti hanno dati: il totale è parziale.`
    );
  }

  return NextResponse.json({
    periodo: { dal: dalStr, al: alStr, giorni: giorniRichiesti },
    filtri: { brand: brand ?? null, canale: canale ?? null },
    // Il numero che conta: la spesa addebitata dalle piattaforme
    totale: Math.round(totale * 100) / 100,
    valuta: "EUR",
    // Contesto utile a chi consuma: conversioni e ricavi DICHIARATI dalle
    // piattaforme (sovrastimati di norma: il reale è il 60-75%). Per i ricavi
    // veri usare gli ordini Shopify — /api/v1/ordini.
    dichiarati: {
      conversioni: Math.round(conversioni * 100) / 100,
      ricavi: Math.round(ricavi * 100) / 100,
      click,
      nota: "conversioni e ricavi sono quelli dichiarati dalle piattaforme, non i ricavi veri: per quelli usare /api/v1/ordini",
    },
    ...(raggruppa
      ? {
          raggruppa,
          righe: [...gruppi.values()]
            .map((g) => ({
              ...g,
              spesa: Math.round(g.spesa * 100) / 100,
              conversioni: Math.round(g.conversioni * 100) / 100,
              ricavi: Math.round(g.ricavi * 100) / 100,
            }))
            .sort((a, b) => (raggruppa === "giorno" || raggruppa === "mese" ? a.chiave.localeCompare(b.chiave) : b.spesa - a.spesa)),
        }
      : {}),
    // Leggere QUESTO prima di usare `totale` per decidere qualcosa.
    copertura: {
      completa,
      ultimoGiornoConDati: ultimoGiornoDato,
      giorniCoperti,
      giorniRichiesti,
      alimentano,
      silenziosi,
      avvertenze,
    },
  });
}
