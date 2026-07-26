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
      where: { brand, data: { gte: p.da, lt: p.a }, stato: { not: "annullato" } },
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
