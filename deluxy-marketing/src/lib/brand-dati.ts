import { prisma } from "@/lib/db";
import type { Periodo } from "@/lib/periodo";

// I numeri di un brand in un periodo, presi dalle due fonti che contano:
// la piattaforma pubblicitaria (spesa, clic, conversioni dichiarate) e
// Shopify (le vendite vere). I Definitivi sono espliciti: Shopify è verità
// sui ricavi, la piattaforma sovrastima. Tenerli accanto è tutto il punto.

export type NumeriBrand = {
  // Dalla piattaforma ADV
  spesa: number;
  ricaviPiattaforma: number;
  conversioni: number;
  click: number;
  impression: number;
  // Da Shopify (ordini non annullati)
  venditeTotali: number;
  ordini: number;
  // Quota delle vendite arrivata da campagne tracciate (UTM)
  venditeDaCampagne: number;
  ordiniDaCampagne: number;
};

const VUOTI: NumeriBrand = {
  spesa: 0, ricaviPiattaforma: 0, conversioni: 0, click: 0, impression: 0,
  venditeTotali: 0, ordini: 0, venditeDaCampagne: 0, ordiniDaCampagne: 0,
};

export async function numeriBrand(brand: string, p: Periodo): Promise<NumeriBrand> {
  const [adv, ordini] = await Promise.all([
    prisma.metricaCampagna.aggregate({
      where: { data: { gte: p.da, lt: p.a }, campagna: { brand } },
      _sum: { spesa: true, ricavi: true, conversioni: true, click: true, impression: true },
    }),
    prisma.ordine.findMany({
      // Fuori annullati E rimborsati, come ovunque nell'app: i primi non sono
      // mai entrati, i secondi sono tornati indietro. Prima qui restavano
      // dentro i rimborsati, e le tessere dei brand davano un totale diverso
      // dalla tabella del mese nella stessa schermata.
      where: { brand, data: { gte: p.da, lt: p.a }, stato: { notIn: ["annullato", "rimborsato"] } },
      select: { totale: true, utmSource: true, utmCampagna: true },
    }),
  ]);

  const n: NumeriBrand = { ...VUOTI };
  n.spesa = adv._sum.spesa ?? 0;
  n.ricaviPiattaforma = adv._sum.ricavi ?? 0;
  n.conversioni = adv._sum.conversioni ?? 0;
  n.click = adv._sum.click ?? 0;
  n.impression = adv._sum.impression ?? 0;

  for (const o of ordini) {
    const t = o.totale ?? 0;
    n.venditeTotali += t;
    n.ordini++;
    // A pagamento: la sorgente UTM dice google/meta/tiktok, oppure c'è una
    // campagna tracciata. L'organico e il diretto non contano qui.
    const s = (o.utmSource ?? "").toLowerCase();
    const daPagato = /google|meta|facebook|instagram|tiktok|fb|ig/.test(s) || !!o.utmCampagna;
    if (daPagato) {
      n.venditeDaCampagne += t;
      n.ordiniDaCampagne++;
    }
  }
  return n;
}

// Spesa e incasso **canale per canale** (Google, Meta, TikTok…).
//
// Il totale di brand nasconde la domanda vera: la media dice 4×, ma può essere
// Google a 6× e Meta a 1,5× — o il contrario. Finché si guarda solo il totale
// si sposta budget alla cieca.
//
// ⚠️ Due incassi diversi, tenuti separati apposta:
//   - `ricaviPiattaforma` è quello che **il canale si attribuisce**. È l'unico
//     numero che esiste per canale, ed è di parte: ogni piattaforma conta a
//     modo suo, e la somma dei canali può superare le vendite vere.
//   - le vendite Shopify **non si sanno spezzare per canale** con questi dati
//     (l'UTM c'è su una minoranza di ordini). Il MER resta quindi un numero di
//     brand, e questa tabella non finge di poterlo dividere.
export type NumeriCanale = {
  canale: string;
  spesa: number;
  ricaviPiattaforma: number;
  conversioni: number;
  click: number;
  impression: number;
  campagne: number;
  roas: number | null;
  cpa: number | null;
  quotaSpesa: number;
};

export async function numeriPerCanale(brand: string, p: Periodo): Promise<NumeriCanale[]> {
  // Una lettura sola e il raggruppamento in memoria: niente giri per riga.
  const righe = await prisma.metricaCampagna.findMany({
    where: { data: { gte: p.da, lt: p.a }, campagna: { brand } },
    select: {
      spesa: true,
      ricavi: true,
      conversioni: true,
      click: true,
      impression: true,
      campagnaId: true,
      campagna: { select: { canale: true } },
    },
  });

  type Accumulo = NumeriCanale & { ids: Set<string> };
  const per = new Map<string, Accumulo>();
  for (const r of righe) {
    const canale = r.campagna.canale;
    const v: Accumulo = per.get(canale) ?? {
      canale,
      spesa: 0,
      ricaviPiattaforma: 0,
      conversioni: 0,
      click: 0,
      impression: 0,
      campagne: 0,
      roas: null,
      cpa: null,
      quotaSpesa: 0,
      ids: new Set<string>(),
    };
    v.spesa += r.spesa ?? 0;
    v.ricaviPiattaforma += r.ricavi ?? 0;
    v.conversioni += r.conversioni ?? 0;
    v.click += r.click ?? 0;
    v.impression += r.impression ?? 0;
    v.ids.add(r.campagnaId);
    per.set(canale, v);
  }

  const totale = [...per.values()].reduce((s, v) => s + v.spesa, 0);
  return [...per.values()]
    .map(({ ids, ...v }) => ({
      ...v,
      campagne: ids.size,
      roas: v.spesa > 0 ? v.ricaviPiattaforma / v.spesa : null,
      cpa: v.conversioni > 0 ? v.spesa / v.conversioni : null,
      quotaSpesa: totale > 0 ? v.spesa / totale : 0,
    }))
    .sort((a, b) => b.spesa - a.spesa);
}

// MER (Marketing Efficiency Ratio): tutte le vendite dell'insegna diviso
// tutta la spesa pubblicitaria. Il ROAS di piattaforma guarda solo ciò che
// la piattaforma si attribuisce; il MER dice se l'azienda sta in piedi.
export function mer(n: NumeriBrand): number | null {
  return n.spesa > 0 ? n.venditeTotali / n.spesa : null;
}

// Quanto delle vendite passa da campagne tracciate
export function quotaPagato(n: NumeriBrand): number | null {
  return n.venditeTotali > 0 ? n.venditeDaCampagne / n.venditeTotali : null;
}

export function roasPiattaforma(n: NumeriBrand): number | null {
  return n.spesa > 0 ? n.ricaviPiattaforma / n.spesa : null;
}

// Scostamento fra ciò che dice la piattaforma e ciò che dice Shopify sulle
// vendite tracciate: se la piattaforma dichiara molto più del venduto vero,
// sta sovrastimando (doc 10 §3: reale ≈ 60-75% del dichiarato).
export function scostamentoAttribuzione(n: NumeriBrand): number | null {
  if (n.venditeDaCampagne <= 0 || n.ricaviPiattaforma <= 0) return null;
  return n.ricaviPiattaforma / n.venditeDaCampagne;
}
