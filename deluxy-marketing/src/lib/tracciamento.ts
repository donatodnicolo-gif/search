import { prisma } from "@/lib/db";

// Le due campane sugli stessi ordini.
//
// Google e Meta dicono quante conversioni hanno prodotto: è un numero di parte,
// costruito con le loro finestre di attribuzione, il view-through e il
// cross-device. Shopify dice da dove è arrivato ogni ordine davvero incassato,
// attribuito al PRIMO contatto del percorso.
//
// Nessuna delle due è "la verità": misurano cose diverse. Ma la DISTANZA fra le
// due dice se il tracciamento sta funzionando, ed è l'unico modo per accorgersi
// che un pixel è rotto prima di aver buttato via un mese di budget.
//
// REGOLA: qui non si aggiusta niente e non si sceglie un vincitore. Si mettono
// i due numeri accanto e si dichiara cosa significano.

export type ConfrontoCanale = {
  canale: string; // google_ads | meta_ads
  nome: string;
  spesa: number;
  // Quello che dichiara la piattaforma
  conversioniDichiarate: number;
  valoreDichiarato: number;
  // Quello che risulta dagli ordini veri, attribuiti da Shopify a quel canale
  ordiniAttribuiti: number;
  valoreAttribuito: number;
  // Rapporti: >1 = la piattaforma si prende più di quanto Shopify le riconosca
  rapportoOrdini: number | null;
  rapportoValore: number | null;
  roasDichiarato: number | null;
  roasReale: number | null;
  lettura: { esito: "ok" | "sovrastima" | "sottostima" | "muto" | "senza-dati"; testo: string };
};

export type QuadroTracciamento = {
  ordiniTotali: number;
  valoreTotale: number;
  // Quota di ordini per cui Shopify non sa dire la provenienza
  senzaProvenienza: number;
  canali: ConfrontoCanale[];
  // Ordini attribuiti a canali non pubblicitari (diretto, ricerca organica…)
  altriCanali: { canale: string; ordini: number; valore: number }[];
};

// Come Shopify chiama i canali pubblicitari, e come li chiamiamo noi.
const CANALE_ADS: Record<string, string> = {
  "google-ads": "google_ads",
  "meta-ads": "meta_ads",
  shopping: "google_ads", // Shopping è Google
};

const NOME_CANALE: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta",
};

export async function quadroTracciamento(da: Date, a: Date, brand?: string): Promise<QuadroTracciamento> {
  const dovOrdini = {
    data: { gte: da, lt: a },
    stato: { notIn: ["annullato", "rimborsato"] },
    ...(brand ? { brand } : {}),
  };

  const [ordini, perOrigine, perCanalePiattaforma] = await Promise.all([
    prisma.ordine.aggregate({ where: dovOrdini, _count: { _all: true }, _sum: { totale: true } }),
    prisma.ordine.groupBy({
      by: ["origine"],
      where: dovOrdini,
      _count: { _all: true },
      _sum: { totale: true },
    }),
    prisma.metricaCampagna.findMany({
      where: {
        data: { gte: da, lt: a },
        ...(brand ? { campagna: { brand } } : {}),
      },
      select: {
        spesa: true,
        conversioni: true,
        ricavi: true,
        campagna: { select: { canale: true } },
      },
    }),
  ]);

  // Somme per canale dal lato piattaforma
  const piattaforma = new Map<string, { spesa: number; conversioni: number; valore: number }>();
  for (const m of perCanalePiattaforma) {
    const c = m.campagna.canale;
    const v = piattaforma.get(c) ?? { spesa: 0, conversioni: 0, valore: 0 };
    v.spesa += m.spesa ?? 0;
    v.conversioni += m.conversioni ?? 0;
    v.valore += m.ricavi ?? 0;
    piattaforma.set(c, v);
  }

  // Somme per canale dal lato ordini veri
  const daShopify = new Map<string, { ordini: number; valore: number }>();
  const altri: { canale: string; ordini: number; valore: number }[] = [];
  let senzaProvenienza = 0;
  for (const o of perOrigine) {
    const etichetta = o.origine ?? "";
    if (!etichetta) {
      senzaProvenienza += o._count._all;
      continue;
    }
    const nostro = CANALE_ADS[etichetta];
    if (nostro) {
      const v = daShopify.get(nostro) ?? { ordini: 0, valore: 0 };
      v.ordini += o._count._all;
      v.valore += o._sum.totale ?? 0;
      daShopify.set(nostro, v);
    } else {
      altri.push({ canale: etichetta, ordini: o._count._all, valore: o._sum.totale ?? 0 });
    }
  }
  altri.sort((x, y) => y.valore - x.valore);

  const canali: ConfrontoCanale[] = [];
  for (const canale of ["google_ads", "meta_ads"]) {
    const p = piattaforma.get(canale) ?? { spesa: 0, conversioni: 0, valore: 0 };
    const s = daShopify.get(canale) ?? { ordini: 0, valore: 0 };
    if (p.spesa === 0 && s.ordini === 0) continue;

    const rapportoOrdini = s.ordini > 0 ? p.conversioni / s.ordini : null;
    const rapportoValore = s.valore > 0 ? p.valore / s.valore : null;

    canali.push({
      canale,
      nome: NOME_CANALE[canale] ?? canale,
      spesa: p.spesa,
      conversioniDichiarate: p.conversioni,
      valoreDichiarato: p.valore,
      ordiniAttribuiti: s.ordini,
      valoreAttribuito: s.valore,
      rapportoOrdini,
      rapportoValore,
      roasDichiarato: p.spesa > 0 ? p.valore / p.spesa : null,
      roasReale: p.spesa > 0 ? s.valore / p.spesa : null,
      lettura: leggi(p, s, rapportoValore),
    });
  }

  return {
    ordiniTotali: ordini._count._all,
    valoreTotale: ordini._sum.totale ?? 0,
    senzaProvenienza,
    canali,
    altriCanali: altri.slice(0, 8),
  };
}

// Il giudizio non è "chi ha ragione", ma "questi due numeri possono convivere?".
function leggi(
  p: { spesa: number; conversioni: number; valore: number },
  s: { ordini: number; valore: number },
  rapportoValore: number | null
): ConfrontoCanale["lettura"] {
  // Prima di tutto: la piattaforma sta mandando qualcosa? Un canale non
  // collegato non è un canale che rende male — dirlo sarebbe un giudizio su un
  // dato che non esiste.
  if (p.spesa === 0 && p.conversioni === 0 && p.valore === 0) {
    return {
      esito: "senza-dati",
      testo:
        s.ordini > 0
          ? `Questo canale non manda ancora niente all'app (manca il collegamento), eppure Shopify gli attribuisce ` +
            `${s.ordini} ordini per ${s.valore.toFixed(0)} €. Non è un canale che rende poco: è un canale che non stiamo misurando.`
          : "Questo canale non manda ancora niente all'app e nessun ordine gli è attribuito: non c'è nulla da confrontare.",
    };
  }
  if (p.spesa > 0 && p.conversioni === 0 && s.ordini > 0) {
    return {
      esito: "muto",
      testo:
        `La piattaforma ha speso ${p.spesa.toFixed(0)} € e dichiara ZERO conversioni, ma Shopify le attribuisce ` +
        `${s.ordini} ordini. È il quadro tipico di un tracciamento rotto: il tag non registra gli acquisti.`,
    };
  }
  if (s.ordini === 0 && p.conversioni > 0) {
    return {
      esito: "senza-dati",
      testo:
        `La piattaforma dichiara ${p.conversioni.toFixed(0)} conversioni ma nessun ordine risulta attribuito a lei da ` +
        `Shopify. O l'attribuzione dei link non passa i parametri, o quelle conversioni non sono acquisti.`,
    };
  }
  if (rapportoValore == null) {
    return { esito: "senza-dati", testo: "Non ci sono abbastanza dati da confrontare in questo periodo." };
  }
  if (rapportoValore > 2) {
    return {
      esito: "sovrastima",
      testo:
        `La piattaforma si attribuisce ${rapportoValore.toFixed(1).replace(".", ",")}× il valore che Shopify le riconosce. ` +
        `Una parte è fisiologica (finestre di attribuzione, view-through, più dispositivi), ma sopra il doppio ` +
        `conviene decidere quale numero si usa per giudicare — e usare sempre quello.`,
    };
  }
  if (rapportoValore < 0.5) {
    return {
      esito: "sottostima",
      testo:
        `La piattaforma si attribuisce meno della metà di quello che Shopify le riconosce ` +
        `(${rapportoValore.toFixed(2).replace(".", ",")}×): sta ottimizzando su un segnale più povero della realtà, e quindi ` +
        `sta imparando peggio di quanto potrebbe.`,
    };
  }
  return {
    esito: "ok",
    testo:
      `Le due campane si somigliano (${rapportoValore.toFixed(2).replace(".", ",")}× sul valore): scarto dentro il fisiologico ` +
      `delle finestre di attribuzione.`,
  };
}
