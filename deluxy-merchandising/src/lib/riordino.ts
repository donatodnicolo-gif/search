// Deluxy Merchandising — ipotesi di ordinativo.
//
// Dal venduto reale (Vendita) e dalla giacenza si ricava quanto conviene
// riordinare di ogni prodotto perché il negozio non resti scoperto né si
// riempia di invenduto. È un'IPOTESI: propone, non ordina. Nessun fornitore
// viene contattato da qui.
//
// Tre scelte volutamente prudenti, perché un ordine sbagliato costa soldi veri:
//
// 1. Il calcolo è per PRODOTTO, non per variante. La giacenza vive sulle
//    varianti e si somma, ma il venduto non sempre arriva con la variante
//    riconosciuta: spalmarlo sulle taglie "a occhio" produrrebbe quantità
//    inventate. Le varianti restano visibili come dettaglio della giacenza.
// 2. Il prezzo usato è quello DAVVERO incassato nella finestra (ricavo/pezzi);
//    solo se non c'è venduto si ripiega sul listino.
// 3. Ogni riga porta con sé la sua confidenza e la frase che spiega la
//    quantità. Una proposta che non si sa spiegare non si firma.

import { prisma } from "./db";
import { FILTRO_BUON_FINE, finestra, type Tendenza } from "./vendite";

export type Parametri = {
  giorniStorico: number; // finestra di venduto osservata
  leadTimeGiorni: number; // quanto ci mette il fornitore a consegnare
  coperturaGiorni: number; // quanti giorni di vendita deve coprire l'ordine
  scortaSicurezzaPct: number; // cuscinetto sull'imprevisto
};

export const PARAMETRI_DEFAULT: Parametri = {
  giorniStorico: 56,
  leadTimeGiorni: 7,
  coperturaGiorni: 21,
  scortaSicurezzaPct: 20,
};

export type Urgenza = "rottura" | "critico" | "ok" | "fermo";

export const ETICHETTA_URGENZA: Record<Urgenza, string> = {
  rottura: "Sotto lead time",
  critico: "In esaurimento",
  ok: "Coperto",
  fermo: "Nessuna vendita",
};

export const COLORE_URGENZA: Record<Urgenza, string> = {
  rottura: "var(--red)",
  critico: "var(--orange)",
  ok: "var(--green)",
  fermo: "var(--text-tertiary)",
};

export type Confidenza = "alta" | "media" | "bassa";

export const ETICHETTA_CONFIDENZA: Record<Confidenza, string> = {
  alta: "Alta",
  media: "Media",
  bassa: "Bassa",
};

export type RigaIpotesi = {
  prodottoId: string;
  codice: string;
  nome: string;
  collezione: string | null;
  categoria: string;
  fase: string;
  fornitore: string | null;
  giacenza: number;
  varianti: { nome: string; giacenza: number }[];
  pezzi: number; // venduti nella finestra
  ritmo: number; // pezzi al giorno usato nel calcolo
  ritmoRecente: number;
  ritmoPrecedente: number;
  tendenza: Tendenza;
  coperturaAttuale: number | null; // giorni coperti dalla giacenza (null = non vende)
  domandaAttesa: number; // pezzi attesi su lead time + copertura
  quantitaSuggerita: number;
  costoUnitario: number;
  costoNoto: boolean; // false = costo di produzione non ancora inserito
  prezzoUnitario: number;
  costoTotale: number;
  ricavoAtteso: number;
  margineAtteso: number | null; // null = non calcolabile senza costo
  urgenza: Urgenza;
  confidenza: Confidenza;
  motivo: string;
};

export type Ipotesi = {
  parametri: Parametri;
  // Brand su cui è calcolata (null = tutti). La giacenza però è unica per
  // prodotto: non esiste un magazzino per negozio, e va detto.
  canale: string | null;
  righe: RigaIpotesi[];
  totali: {
    articoli: number;
    pezzi: number;
    costo: number;
    ricavo: number;
    margine: number;
    // Su quanti articoli il margine è davvero calcolabile: il resto non ha costo.
    articoliConCosto: number;
  };
  daRiordinare: number;
  inRottura: number;
  avvisi: string[];
};

function arrotonda(n: number, decimali = 2): number {
  const f = 10 ** decimali;
  return Math.round(n * f) / f;
}

function classificaTendenza(recente: number, precedente: number): Tendenza {
  if (recente === 0) return precedente > 0 ? "fermo" : "stabile";
  if (precedente === 0) return "nuovo";
  const d = (recente - precedente) / precedente;
  if (d >= 0.15) return "crescita";
  if (d <= -0.15) return "calo";
  return "stabile";
}

/**
 * Calcola l'ipotesi di ordinativo sull'assortimento vivo (fasi approvato /
 * in vendita: quello che ha senso comprare oggi).
 */
export async function calcolaIpotesi(p: Parametri & { canale?: string | null }): Promise<Ipotesi> {
  const canale = p.canale ?? null;
  const par: Parametri = {
    giorniStorico: Math.max(14, Math.min(365, Math.round(p.giorniStorico))),
    leadTimeGiorni: Math.max(0, Math.min(120, Math.round(p.leadTimeGiorni))),
    coperturaGiorni: Math.max(1, Math.min(180, Math.round(p.coperturaGiorni))),
    scortaSicurezzaPct: Math.max(0, Math.min(100, Math.round(p.scortaSicurezzaPct))),
  };

  const f = finestra(par.giorniStorico);
  // Metà recente / metà precedente della stessa finestra: è il confronto con cui
  // si capisce se il ritmo sta salendo o scendendo.
  const meta = new Date(f.al.getTime() - (par.giorniStorico / 2) * 24 * 60 * 60 * 1000);

  const [prodotti, vendite] = await Promise.all([
    prisma.prodotto.findMany({
      where: {
        fase: { in: ["approvato", "in_vendita"] },
        // Dentro un brand si propone solo ciò che su quel brand si vende.
        ...(canale ? { vendite: { some: { canale } } } : {}),
      },
      include: {
        collezione: { select: { nome: true } },
        fornitore: { select: { nome: true } },
        varianti: { select: { nome: true, giacenza: true } },
      },
    }),
    // Solo vendite andate a buon fine: un ordine rimborsato o mai incassato non
    // è domanda, e comprarci sopra significa comprare merce che nessuno ha
    // davvero voluto.
    prisma.vendita.findMany({
      where: {
        data: { gte: f.dal, lte: f.al },
        prodottoId: { not: null },
        ...FILTRO_BUON_FINE,
        ...(canale ? { canale } : {}),
      },
      select: { prodottoId: true, data: true, quantita: true, ricavo: true },
    }),
  ]);

  type Acc = { pezzi: number; ricavo: number; recenti: number; precedenti: number; giorni: Set<string> };
  const perProdotto = new Map<string, Acc>();
  for (const v of vendite) {
    if (!v.prodottoId) continue;
    const a =
      perProdotto.get(v.prodottoId) ??
      ({ pezzi: 0, ricavo: 0, recenti: 0, precedenti: 0, giorni: new Set<string>() } as Acc);
    a.pezzi += v.quantita;
    a.ricavo += v.ricavo;
    if (v.data >= meta) a.recenti += v.quantita;
    else a.precedenti += v.quantita;
    a.giorni.add(v.data.toISOString().slice(0, 10));
    perProdotto.set(v.prodottoId, a);
  }

  const mezzaFinestra = par.giorniStorico / 2;
  const righe: RigaIpotesi[] = prodotti.map((pr) => {
    const a = perProdotto.get(pr.id);
    const pezzi = a?.pezzi ?? 0;
    const ritmoRecente = (a?.recenti ?? 0) / mezzaFinestra;
    const ritmoPrecedente = (a?.precedenti ?? 0) / mezzaFinestra;

    // Ritmo di riferimento: pesa di più il passato prossimo, senza buttare via
    // il resto della finestra (una settimana storta non deve dettare l'ordine).
    const ritmo =
      ritmoPrecedente > 0 ? 0.65 * ritmoRecente + 0.35 * ritmoPrecedente : ritmoRecente;

    // Correzione di tendenza, tenuta corta apposta: al massimo ±35%, perché su
    // poche settimane un'accelerazione può essere un caso e non una tendenza.
    const fattore =
      ritmoPrecedente > 0 ? Math.min(1.35, Math.max(0.75, ritmoRecente / ritmoPrecedente)) : 1;

    const giacenza = pr.varianti.reduce((s, v) => s + v.giacenza, 0);
    const orizzonte = par.leadTimeGiorni + par.coperturaGiorni;
    const domandaAttesa = ritmo * orizzonte * fattore;
    const fabbisogno = domandaAttesa * (1 + par.scortaSicurezzaPct / 100) - giacenza;
    const quantitaSuggerita = Math.max(0, Math.ceil(fabbisogno));

    const coperturaAttuale = ritmo > 0 ? giacenza / ritmo : null;
    const urgenza: Urgenza =
      ritmo === 0
        ? "fermo"
        : coperturaAttuale! < par.leadTimeGiorni
          ? "rottura"
          : coperturaAttuale! < par.leadTimeGiorni + 7
            ? "critico"
            : "ok";

    const giorniConVendite = a?.giorni.size ?? 0;
    const confidenza: Confidenza =
      giorniConVendite >= 15 ? "alta" : giorniConVendite >= 5 ? "media" : "bassa";

    // Prezzo davvero incassato nella finestra; senza venduto si usa il listino.
    const prezzoUnitario = pezzi > 0 ? (a as Acc).ricavo / pezzi : pr.prezzoVendita;
    const costoUnitario = pr.costoProduzione;

    const motivo =
      ritmo === 0
        ? giacenza > 0
          ? `Nessuna vendita negli ultimi ${par.giorniStorico} giorni con ${giacenza} pz a magazzino: non riordinare, semmai spingerlo.`
          : `Nessuna vendita negli ultimi ${par.giorniStorico} giorni.`
        : `${arrotonda(ritmo, 2)} pz/giorno · giacenza ${giacenza} pz = ${Math.round(coperturaAttuale ?? 0)} giorni di copertura. ` +
          `Per coprire ${orizzonte} giorni (${par.leadTimeGiorni} di lead time + ${par.coperturaGiorni}) con ${par.scortaSicurezzaPct}% di scorta servono ${Math.ceil(domandaAttesa * (1 + par.scortaSicurezzaPct / 100))} pz.`;

    return {
      prodottoId: pr.id,
      codice: pr.codice,
      nome: pr.nome,
      collezione: pr.collezione?.nome ?? null,
      categoria: pr.categoria,
      fase: pr.fase,
      fornitore: pr.fornitore?.nome ?? null,
      giacenza,
      varianti: pr.varianti.map((v) => ({ nome: v.nome, giacenza: v.giacenza })),
      pezzi,
      ritmo: arrotonda(ritmo, 3),
      ritmoRecente: arrotonda(ritmoRecente, 3),
      ritmoPrecedente: arrotonda(ritmoPrecedente, 3),
      tendenza: classificaTendenza(ritmoRecente, ritmoPrecedente),
      coperturaAttuale: coperturaAttuale != null ? arrotonda(coperturaAttuale, 1) : null,
      domandaAttesa: arrotonda(domandaAttesa, 1),
      quantitaSuggerita,
      costoUnitario,
      costoNoto: costoUnitario > 0,
      prezzoUnitario: arrotonda(prezzoUnitario, 2),
      costoTotale: arrotonda(quantitaSuggerita * costoUnitario, 2),
      ricavoAtteso: arrotonda(quantitaSuggerita * prezzoUnitario, 2),
      // Senza costo il margine non si stima: null è più onesto di "tutto margine".
      margineAtteso:
        costoUnitario > 0 ? arrotonda(quantitaSuggerita * (prezzoUnitario - costoUnitario), 2) : null,
      urgenza,
      confidenza,
      motivo,
    };
  });

  // Prima chi rischia di restare scoperto, poi chi vale di più.
  const ordineUrgenza: Record<Urgenza, number> = { rottura: 0, critico: 1, ok: 2, fermo: 3 };
  righe.sort(
    (a, b) => ordineUrgenza[a.urgenza] - ordineUrgenza[b.urgenza] || b.costoTotale - a.costoTotale
  );

  const daRiordinare = righe.filter((r) => r.quantitaSuggerita > 0);
  const totali = daRiordinare.reduce(
    (s, r) => ({
      articoli: s.articoli + 1,
      pezzi: s.pezzi + r.quantitaSuggerita,
      costo: s.costo + r.costoTotale,
      ricavo: s.ricavo + r.ricavoAtteso,
      margine: s.margine + (r.margineAtteso ?? 0),
      articoliConCosto: s.articoliConCosto + (r.costoNoto ? 1 : 0),
    }),
    { articoli: 0, pezzi: 0, costo: 0, ricavo: 0, margine: 0, articoliConCosto: 0 }
  );

  const avvisi: string[] = [];
  const senzaStorico = righe.filter((r) => r.confidenza === "bassa" && r.quantitaSuggerita > 0).length;
  if (senzaStorico > 0)
    avvisi.push(
      `${senzaStorico} propost${senzaStorico === 1 ? "a" : "e"} poggia${senzaStorico === 1 ? "" : "no"} su meno di 5 giorni di vendita: trattale come indizi, non come numeri.`
    );
  const senzaCosto = daRiordinare.filter((r) => !r.costoNoto).length;
  if (senzaCosto > 0)
    avvisi.push(
      `${senzaCosto} prodotti su ${daRiordinare.length} non hanno il costo di produzione: per loro il valore dell'ordine risulta 0 e il margine atteso non è calcolabile (non viene stimato a caso).`
    );
  const senzaGiacenza = righe.filter((r) => r.varianti.length === 0).length;
  if (senzaGiacenza > 0)
    avvisi.push(
      `${senzaGiacenza} prodotti non hanno varianti, quindi nessuna giacenza registrata: risultano scoperti anche se in magazzino c'è merce.`
    );

  if (canale)
    avvisi.push(
      `Ritmo calcolato sulle sole vendite di ${canale}, ma la giacenza è unica per prodotto: non esiste un magazzino per negozio, quindi la copertura vale per tutti i brand insieme.`
    );

  return {
    parametri: par,
    canale,
    righe,
    totali: {
      articoli: totali.articoli,
      pezzi: totali.pezzi,
      costo: arrotonda(totali.costo),
      ricavo: arrotonda(totali.ricavo),
      margine: arrotonda(totali.margine),
      articoliConCosto: totali.articoliConCosto,
    },
    daRiordinare: daRiordinare.length,
    inRottura: righe.filter((r) => r.urgenza === "rottura").length,
    avvisi,
  };
}

/** Legge i parametri dalla querystring della pagina, con i default dell'app. */
export function parametriDaQuery(sp: Record<string, string | string[] | undefined>): Parametri {
  const n = (k: string, def: number) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    const x = s != null ? parseInt(s, 10) : NaN;
    return Number.isFinite(x) ? x : def;
  };
  return {
    giorniStorico: n("storico", PARAMETRI_DEFAULT.giorniStorico),
    leadTimeGiorni: n("lead", PARAMETRI_DEFAULT.leadTimeGiorni),
    coperturaGiorni: n("copertura", PARAMETRI_DEFAULT.coperturaGiorni),
    scortaSicurezzaPct: n("scorta", PARAMETRI_DEFAULT.scortaSicurezzaPct),
  };
}
