// Deluxy Merchandising — lettura del venduto.
//
// Qui non si vende niente: si legge il venduto che arriva dal registro
// centralizzato Deluxy Orders (vedi orders.ts) e lo si trasforma nei numeri che
// servono a una maison — cosa tira, cosa si è spento, quanto margine porta
// davvero ogni pezzo, quanto ritmo ha ogni prodotto.
//
// Regola: tutti i numeri si calcolano QUI. Le pagine mostrano, l'AI interpreta,
// nessuno dei due somma. Un totale calcolato in due posti diversi prima o poi
// diverge, e il riordino sbagliato lo paga il fornitore.

import { prisma } from "./db";
import { calcolaMargine } from "./dominio";

// ---------- Finestre temporali ----------

export const FINESTRE = [28, 56, 90, 180, 365] as const;

export const ETICHETTA_FINESTRA: Record<number, string> = {
  28: "Ultimi 28 giorni",
  56: "Ultime 8 settimane",
  90: "Ultimi 3 mesi",
  180: "Ultimi 6 mesi",
  365: "Ultimo anno",
};

export function inizioGiorno(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function fineGiorno(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export type Finestra = {
  giorni: number;
  dal: Date;
  al: Date;
  // Il periodo immediatamente precedente, della stessa lunghezza: è il metro di
  // paragone di ogni confronto ("+18% sul periodo precedente").
  dalPrec: Date;
  alPrec: Date;
};

export function finestra(giorni: number): Finestra {
  const al = fineGiorno(new Date());
  const dal = inizioGiorno(new Date(al));
  dal.setDate(dal.getDate() - (giorni - 1));
  const alPrec = new Date(dal.getTime() - 1);
  const dalPrec = inizioGiorno(new Date(alPrec));
  dalPrec.setDate(dalPrec.getDate() - (giorni - 1));
  return { giorni, dal, al, dalPrec, alPrec };
}

// ---------- Tipi ----------

export type Tendenza = "nuovo" | "crescita" | "stabile" | "calo" | "fermo";

export const ETICHETTA_TENDENZA: Record<Tendenza, string> = {
  nuovo: "Nuovo",
  crescita: "In crescita",
  stabile: "Stabile",
  calo: "In calo",
  fermo: "Fermo",
};

export const COLORE_TENDENZA: Record<Tendenza, string> = {
  nuovo: "var(--blue)",
  crescita: "var(--green)",
  stabile: "var(--text-tertiary)",
  calo: "var(--orange)",
  fermo: "var(--red)",
};

export type PuntoSerie = {
  etichetta: string; // "12 lug" oppure "sett. 28"
  inizio: Date;
  pezzi: number;
  ricavo: number;
};

export type RigaProdotto = {
  prodottoId: string;
  nome: string;
  codice: string;
  categoria: string;
  collezione: string | null;
  pezzi: number;
  ricavo: number;
  margine: number;
  marginePct: number;
  pezziPrec: number;
  ricavoPrec: number;
  deltaPezzi: number | null; // frazione (0.18 = +18%); null se prima non vendeva
  ritmo: number; // pezzi al giorno nella finestra
  tendenza: Tendenza;
  serie: number[]; // micro-serie settimanale per lo sparkline
};

export type RigaGruppo = {
  chiave: string;
  nome: string;
  pezzi: number;
  ricavo: number;
  ricavoPrec: number;
  delta: number | null;
  quota: number; // quota sul ricavo totale della finestra
};

export type Analisi = {
  finestra: Finestra;
  passo: "giorno" | "settimana";
  serie: PuntoSerie[];
  totale: { pezzi: number; ricavo: number; margine: number; marginePct: number; scontrino: number };
  precedente: { pezzi: number; ricavo: number; margine: number };
  delta: { pezzi: number | null; ricavo: number | null; margine: number | null };
  prodotti: RigaProdotto[];
  collezioni: RigaGruppo[];
  categorie: RigaGruppo[];
  canali: RigaGruppo[];
  // Righe vendute che non corrispondono a nessun prodotto di questa app.
  nonAbbinate: { titolo: string; sku: string | null; pezzi: number; ricavo: number }[];
  ricavoNonAbbinato: number;
  giorniConVendite: number;
  ultimaVendita: Date | null;
  totaleRighe: number;
};

// ---------- Motore ----------

type VenditaCaricata = {
  data: Date;
  titolo: string;
  sku: string | null;
  canale: string;
  quantita: number;
  ricavo: number;
  prodotto: {
    id: string;
    nome: string;
    codice: string;
    categoria: string;
    costoProduzione: number;
    prezzoVendita: number;
    collezione: { id: string; nome: string } | null;
  } | null;
  variante: { id: string; nome: string; deltaCosto: number } | null;
};

const SELECT_VENDITA = {
  data: true,
  titolo: true,
  sku: true,
  canale: true,
  quantita: true,
  ricavo: true,
  prodotto: {
    select: {
      id: true,
      nome: true,
      codice: true,
      categoria: true,
      costoProduzione: true,
      prezzoVendita: true,
      collezione: { select: { id: true, nome: true } },
    },
  },
  variante: { select: { id: true, nome: true, deltaCosto: true } },
} as const;

/** Costo industriale di una riga venduta (prodotto + delta variante). */
function costoRiga(v: VenditaCaricata): number | null {
  if (!v.prodotto) return null;
  return (v.prodotto.costoProduzione || 0) + (v.variante?.deltaCosto || 0);
}

function variazione(ora: number, prima: number): number | null {
  if (prima <= 0) return ora > 0 ? null : 0; // "null" = non confrontabile, non "+∞"
  return (ora - prima) / prima;
}

function classificaTendenza(pezzi: number, pezziPrec: number): Tendenza {
  if (pezzi === 0) return pezziPrec > 0 ? "fermo" : "stabile";
  if (pezziPrec === 0) return "nuovo";
  const d = (pezzi - pezziPrec) / pezziPrec;
  if (d >= 0.15) return "crescita";
  if (d <= -0.15) return "calo";
  return "stabile";
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function etichettaGiorno(d: Date): string {
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}

/**
 * Analisi completa del venduto su una finestra temporale.
 * `filtro` restringe a una collezione o a una categoria (le pagine lo usano per
 * i menu a tendina); il periodo di confronto segue lo stesso filtro.
 */
export async function analizzaVendite(
  giorni: number,
  filtro?: { collezioneId?: string | null; categoria?: string | null; canale?: string | null }
): Promise<Analisi> {
  const f = finestra(giorni);

  const whereProdotto: Record<string, unknown> = {};
  if (filtro?.collezioneId) whereProdotto.collezioneId = filtro.collezioneId;
  if (filtro?.categoria) whereProdotto.categoria = filtro.categoria;
  const filtraProdotto = Object.keys(whereProdotto).length > 0;

  const righe = (await prisma.vendita.findMany({
    where: {
      data: { gte: f.dalPrec, lte: f.al },
      ...(filtraProdotto ? { prodotto: whereProdotto } : {}),
      ...(filtro?.canale ? { canale: filtro.canale } : {}),
    },
    select: SELECT_VENDITA,
    orderBy: { data: "asc" },
  })) as VenditaCaricata[];

  const correnti = righe.filter((r) => r.data >= f.dal);
  const precedenti = righe.filter((r) => r.data < f.dal);

  // — Serie temporale: giorni fino a 8 settimane, poi settimane (leggibilità) —
  const passo: "giorno" | "settimana" = giorni <= 56 ? "giorno" : "settimana";
  const serie: PuntoSerie[] = [];
  const indiceSerie = new Map<string, PuntoSerie>();
  const passoMs = 24 * 60 * 60 * 1000;
  for (let t = f.dal.getTime(); t <= f.al.getTime(); t += passo === "giorno" ? passoMs : 7 * passoMs) {
    const inizio = new Date(t);
    const punto: PuntoSerie = {
      inizio,
      etichetta: passo === "giorno" ? etichettaGiorno(inizio) : `${etichettaGiorno(inizio)}`,
      pezzi: 0,
      ricavo: 0,
    };
    serie.push(punto);
    indiceSerie.set(chiaveSerie(inizio, f.dal, passo), punto);
  }
  for (const r of correnti) {
    const p = indiceSerie.get(chiaveSerie(r.data, f.dal, passo));
    if (p) {
      p.pezzi += r.quantita;
      p.ricavo += r.ricavo;
    }
  }

  // — Totali —
  let pezzi = 0;
  let ricavo = 0;
  let margine = 0;
  let ricavoConCosto = 0;
  const giorniVisti = new Set<string>();
  let ultima: Date | null = null;
  for (const r of correnti) {
    pezzi += r.quantita;
    ricavo += r.ricavo;
    const c = costoRiga(r);
    if (c != null) {
      margine += r.ricavo - c * r.quantita;
      ricavoConCosto += r.ricavo;
    }
    giorniVisti.add(r.data.toISOString().slice(0, 10));
    if (!ultima || r.data > ultima) ultima = r.data;
  }

  let pezziPrec = 0;
  let ricavoPrec = 0;
  let marginePrec = 0;
  for (const r of precedenti) {
    pezziPrec += r.quantita;
    ricavoPrec += r.ricavo;
    const c = costoRiga(r);
    if (c != null) marginePrec += r.ricavo - c * r.quantita;
  }

  // — Per prodotto —
  const perProdotto = new Map<string, RigaProdotto>();
  const settimaneSparkline = 8;
  const inizioSpark = new Date(f.al.getTime() - settimaneSparkline * 7 * passoMs);
  for (const r of correnti) {
    if (!r.prodotto) continue;
    const p = r.prodotto;
    let riga = perProdotto.get(p.id);
    if (!riga) {
      riga = {
        prodottoId: p.id,
        nome: p.nome,
        codice: p.codice,
        categoria: p.categoria,
        collezione: p.collezione?.nome ?? null,
        pezzi: 0,
        ricavo: 0,
        margine: 0,
        marginePct: 0,
        pezziPrec: 0,
        ricavoPrec: 0,
        deltaPezzi: null,
        ritmo: 0,
        tendenza: "stabile",
        serie: new Array(settimaneSparkline).fill(0),
      };
      perProdotto.set(p.id, riga);
    }
    riga.pezzi += r.quantita;
    riga.ricavo += r.ricavo;
    const c = costoRiga(r);
    if (c != null) riga.margine += r.ricavo - c * r.quantita;
    if (r.data >= inizioSpark) {
      const i = Math.min(
        settimaneSparkline - 1,
        Math.floor((r.data.getTime() - inizioSpark.getTime()) / (7 * passoMs))
      );
      riga.serie[i] += r.quantita;
    }
  }
  for (const r of precedenti) {
    if (!r.prodotto) continue;
    const riga = perProdotto.get(r.prodotto.id);
    if (!riga) continue; // venduto prima e non ora: compare tra i "fermi" più sotto
    riga.pezziPrec += r.quantita;
    riga.ricavoPrec += r.ricavo;
  }
  // Prodotti che vendevano prima e ora non vendono più: vanno visti, non nascosti.
  for (const r of precedenti) {
    if (!r.prodotto || perProdotto.has(r.prodotto.id)) continue;
    const p = r.prodotto;
    perProdotto.set(p.id, {
      prodottoId: p.id,
      nome: p.nome,
      codice: p.codice,
      categoria: p.categoria,
      collezione: p.collezione?.nome ?? null,
      pezzi: 0,
      ricavo: 0,
      margine: 0,
      marginePct: 0,
      pezziPrec: r.quantita,
      ricavoPrec: r.ricavo,
      deltaPezzi: -1,
      ritmo: 0,
      tendenza: "fermo",
      serie: new Array(settimaneSparkline).fill(0),
    });
  }
  const prodotti = [...perProdotto.values()].map((r) => ({
    ...r,
    marginePct: r.ricavo > 0 ? r.margine / r.ricavo : 0,
    ritmo: r.pezzi / giorni,
    deltaPezzi: variazione(r.pezzi, r.pezziPrec),
    tendenza: classificaTendenza(r.pezzi, r.pezziPrec),
  }));
  prodotti.sort((a, b) => b.ricavo - a.ricavo);

  // — Raggruppamenti —
  const collezioni = raggruppa(
    correnti,
    precedenti,
    (r) => (r.prodotto?.collezione ? { chiave: r.prodotto.collezione.id, nome: r.prodotto.collezione.nome } : null),
    ricavo
  );
  const categorie = raggruppa(
    correnti,
    precedenti,
    (r) => (r.prodotto ? { chiave: r.prodotto.categoria, nome: r.prodotto.categoria } : null),
    ricavo
  );
  const canali = raggruppa(correnti, precedenti, (r) => ({ chiave: r.canale, nome: r.canale }), ricavo);

  // — Righe non abbinate a un prodotto —
  const nonAbb = new Map<string, { titolo: string; sku: string | null; pezzi: number; ricavo: number }>();
  let ricavoNonAbbinato = 0;
  for (const r of correnti) {
    if (r.prodotto) continue;
    ricavoNonAbbinato += r.ricavo;
    const k = `${r.sku ?? ""}|${r.titolo}`;
    const v = nonAbb.get(k) ?? { titolo: r.titolo, sku: r.sku, pezzi: 0, ricavo: 0 };
    v.pezzi += r.quantita;
    v.ricavo += r.ricavo;
    nonAbb.set(k, v);
  }

  return {
    finestra: f,
    passo,
    serie,
    totale: {
      pezzi,
      ricavo,
      margine,
      marginePct: ricavoConCosto > 0 ? margine / ricavoConCosto : 0,
      scontrino: pezzi > 0 ? ricavo / pezzi : 0,
    },
    precedente: { pezzi: pezziPrec, ricavo: ricavoPrec, margine: marginePrec },
    delta: {
      pezzi: variazione(pezzi, pezziPrec),
      ricavo: variazione(ricavo, ricavoPrec),
      margine: variazione(margine, marginePrec),
    },
    prodotti,
    collezioni,
    categorie,
    canali,
    nonAbbinate: [...nonAbb.values()].sort((a, b) => b.ricavo - a.ricavo),
    ricavoNonAbbinato,
    giorniConVendite: giorniVisti.size,
    ultimaVendita: ultima,
    totaleRighe: correnti.length,
  };
}

function chiaveSerie(d: Date, dal: Date, passo: "giorno" | "settimana"): string {
  const giorno = Math.floor((inizioGiorno(d).getTime() - dal.getTime()) / (24 * 60 * 60 * 1000));
  return passo === "giorno" ? `g${giorno}` : `g${Math.floor(giorno / 7) * 7}`;
}

function raggruppa(
  correnti: VenditaCaricata[],
  precedenti: VenditaCaricata[],
  chiave: (r: VenditaCaricata) => { chiave: string; nome: string } | null,
  ricavoTotale: number
): RigaGruppo[] {
  const m = new Map<string, RigaGruppo>();
  for (const r of correnti) {
    const k = chiave(r);
    if (!k) continue;
    const g = m.get(k.chiave) ?? { chiave: k.chiave, nome: k.nome, pezzi: 0, ricavo: 0, ricavoPrec: 0, delta: null, quota: 0 };
    g.pezzi += r.quantita;
    g.ricavo += r.ricavo;
    m.set(k.chiave, g);
  }
  for (const r of precedenti) {
    const k = chiave(r);
    if (!k) continue;
    const g = m.get(k.chiave);
    if (!g) continue;
    g.ricavoPrec += r.ricavo;
  }
  return [...m.values()]
    .map((g) => ({ ...g, delta: variazione(g.ricavo, g.ricavoPrec), quota: ricavoTotale > 0 ? g.ricavo / ricavoTotale : 0 }))
    .sort((a, b) => b.ricavo - a.ricavo);
}

/** Margine unitario di un prodotto (comodo per le tabelle). */
export function margineProdotto(costo: number, prezzo: number) {
  return calcolaMargine(costo, prezzo);
}

/** Da quanti giorni l'app ha vendute registrate (serve a dire "storico corto"). */
export async function coperturaStorico(): Promise<{ prima: Date | null; ultima: Date | null; righe: number }> {
  const [agg, righe] = await Promise.all([
    prisma.vendita.aggregate({ _min: { data: true }, _max: { data: true } }),
    prisma.vendita.count(),
  ]);
  return { prima: agg._min.data ?? null, ultima: agg._max.data ?? null, righe };
}

/** Formattazione compatta di una variazione percentuale ("+18%", "−7%", "n.d."). */
export function delta(v: number | null): string {
  if (v == null) return "n.d.";
  const pct = Math.round(v * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

export function coloreDelta(v: number | null): string {
  if (v == null) return "var(--text-tertiary)";
  if (v > 0.02) return "var(--green)";
  if (v < -0.02) return "var(--red)";
  return "var(--text-secondary)";
}
