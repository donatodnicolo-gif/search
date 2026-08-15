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
import { giornoMeseRoma, giornoRoma, sommaGiorniRoma } from "./fuso";

// ---------- Finestre temporali ----------

export const FINESTRE = [28, 56, 90, 180, 365] as const;

export const ETICHETTA_FINESTRA: Record<number, string> = {
  28: "Ultimi 28 giorni",
  56: "Ultime 8 settimane",
  90: "Ultimi 3 mesi",
  180: "Ultimi 6 mesi",
  365: "Ultimo anno",
};

// I confini dei giorni sono quelli **di Roma**, non del server: su Vercel (UTC)
// «ultimi 28 giorni» partiva e finiva alle 2 di notte italiane, e le righe sul
// confine cadevano nel periodo sbagliato. Stessa regola dell'import (orders.ts).
export function inizioGiorno(d: Date): Date {
  return giornoRoma(d);
}

export function fineGiorno(d: Date): Date {
  return new Date(sommaGiorniRoma(d, 1).getTime() - 1);
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
  const dal = sommaGiorniRoma(new Date(), -(giorni - 1));
  const alPrec = new Date(dal.getTime() - 1);
  const dalPrec = sommaGiorniRoma(alPrec, -(giorni - 1));
  return { giorni, dal, al, dalPrec, alPrec };
}

// ---------- Vendite andate a buon fine ----------
//
// Una riga vale come vendita solo se l'ordine è stato PAGATO e non rimborsato.
// Restano fuori:
// - REFUNDED e PARTIALLY_REFUNDED: soldi tornati indietro. Del parzialmente
//   rimborsato non si sa QUALE riga sia stata resa, quindi l'ordine intero
//   resta fuori: meglio perdere una riga buona che premiare un prodotto che
//   genera resi;
// - PENDING e VOIDED: ordini mai incassati;
// - gli annullati non arrivano nemmeno: Deluxy Orders non li espone.
//
// NON si pretende invece l'evasione (`FULFILLED`): quasi metà del venduto è
// UNFULFILLED perché la consegna è nel futuro o non viene segnata su Shopify.
// Chiederla taglierebbe fuori vendite verissime.
export const PAGAMENTI_BUON_FINE = ["PAID", "PARTIALLY_PAID"] as const;

export const FILTRO_BUON_FINE = { statoPagamento: { in: [...PAGAMENTI_BUON_FINE] } };

export const ETICHETTA_PAGAMENTO: Record<string, string> = {
  PAID: "Pagato",
  PARTIALLY_PAID: "Pagato in parte",
  PENDING: "Non incassato",
  REFUNDED: "Rimborsato",
  PARTIALLY_REFUNDED: "Rimborsato in parte",
  VOIDED: "Annullato dal pagamento",
};

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
  // Quanto del ricavo di questa riga ha un costo di produzione inserito: se è 0
  // il margine non si può dire, e la tabella scrive "—" invece di un numero.
  ricavoConCosto: number;
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
  totale: {
    pezzi: number;
    ricavo: number;
    margine: number;
    marginePct: number;
    scontrino: number;
    // Quota del venduto su cui il margine è calcolabile (0 = nessun costo inserito).
    quotaConCosto: number;
  };
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

// Costo industriale di una riga venduta (prodotto + delta variante).
//
// Costo zero NON è un costo: è un costo che nessuno ha ancora inserito
// (succede a tutti i prodotti nati dall'import del venduto). Contarlo come 0
// darebbe "margine 100%" su tutto, che è falso e pure rassicurante. Qui la riga
// esce dal calcolo del margine e il totale dichiara quanta parte del venduto ha
// davvero un costo noto.
function costoRiga(v: VenditaCaricata): number | null {
  if (!v.prodotto) return null;
  const costo = (v.prodotto.costoProduzione || 0) + (v.variante?.deltaCosto || 0);
  return costo > 0 ? costo : null;
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
  // Il giorno di Roma, non del server: `getDate()` su Vercel (UTC) etichettava
  // «14 ago» un punto che rappresenta la mezzanotte italiana del 15.
  const { giorno, mese } = giornoMeseRoma(d);
  return `${giorno} ${MESI[mese - 1]}`;
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
      // Qui dentro passa TUTTO il venduto, rimborsi e non incassati compresi:
      // /vendite è il registro di quello che è successo, e lo dichiara in
      // pagina. Ma i prodotti **esclusi dalle analisi** e gli **archiviati**
      // restano fuori anche da qui: «Escludi dalle analisi» promette che il
      // prodotto sparisce da classifiche, andamento, assortimento e ipotesi —
      // e questa funzione è l'andamento. Le righe non abbinate (prodotto null)
      // restano: non si butta venduto vero perché nessuno l'ha riconosciuto.
      OR: [
        { prodottoId: null },
        { prodotto: { esclusoDaAnalisi: false, fase: { not: "archiviato" } } },
      ],
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
  // I punti si generano coi giorni **di Roma** (sommaGiorniRoma), non sommando
  // 24h secche: nei giorni del cambio d'ora le mezzanotti italiane distano 23 o
  // 25 ore e il passo fisso finiva fuori allineamento coi giorni delle righe.
  const passoGiorni = passo === "giorno" ? 1 : 7;
  for (let k = 0; ; k += passoGiorni) {
    const inizio = sommaGiorniRoma(f.dal, k);
    if (inizio.getTime() > f.al.getTime()) break;
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
  const msGiorno = 24 * 60 * 60 * 1000;
  const inizioSpark = new Date(f.al.getTime() - settimaneSparkline * 7 * msGiorno);
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
        ricavoConCosto: 0,
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
    if (c != null) {
      riga.margine += r.ricavo - c * r.quantita;
      riga.ricavoConCosto += r.ricavo;
    }
    if (r.data >= inizioSpark) {
      const i = Math.min(
        settimaneSparkline - 1,
        Math.floor((r.data.getTime() - inizioSpark.getTime()) / (7 * msGiorno))
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
    // Lo sparkline copre 8 settimane fisse: con finestre più corte le prime
    // settimane cadono nel periodo «precedente», che è già qui in memoria.
    // Ignorarlo disegnava un «partito da zero» falso su prodotti stabili.
    if (r.data >= inizioSpark) {
      const i = Math.min(
        settimaneSparkline - 1,
        Math.floor((r.data.getTime() - inizioSpark.getTime()) / (7 * msGiorno))
      );
      riga.serie[i] += r.quantita;
    }
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
      ricavoConCosto: 0,
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
    marginePct: r.ricavoConCosto > 0 ? r.margine / r.ricavoConCosto : 0,
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
      quotaConCosto: ricavo > 0 ? ricavoConCosto / ricavo : 0,
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
  // `round`, non `floor`: fra due mezzanotti di Roma passano n×24h ± 1h nei
  // giorni del cambio d'ora, e col floor l'ora mancante faceva scivolare la
  // riga nel giorno prima.
  const giorno = Math.round((inizioGiorno(d).getTime() - dal.getTime()) / (24 * 60 * 60 * 1000));
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

// ---------- Panoramica per brand ----------

export type RigaBrand = {
  brand: string;
  pezzi: number;
  ricavo: number;
  ricavoPrec: number;
  delta: number | null;
  quota: number;
  articoli: number;
  top: { nome: string; prodottoId: string | null; pezzi: number; ricavo: number } | null;
};

/**
 * Il venduto di ogni brand nella finestra, col confronto sul periodo
 * precedente e il prodotto che tira di più. È la vista "globale": mostra i
 * mondi affiancati invece di sommarli in un numero solo che non è di nessuno.
 * Conta solo le vendite andate a buon fine.
 */
export async function panoramicaBrand(giorni: number): Promise<{ finestra: Finestra; brand: RigaBrand[]; totale: { pezzi: number; ricavo: number; ricavoPrec: number; delta: number | null } }> {
  const f = finestra(giorni);
  const dove = {
    ...FILTRO_BUON_FINE,
    OR: [{ prodottoId: null }, { prodotto: { fase: { not: "archiviato" }, esclusoDaAnalisi: false } }],
  };

  const [correnti, precedenti] = await Promise.all([
    prisma.vendita.findMany({
      where: { data: { gte: f.dal, lte: f.al }, ...dove },
      select: { canale: true, prodottoId: true, titolo: true, quantita: true, ricavo: true },
    }),
    prisma.vendita.groupBy({
      by: ["canale"],
      where: { data: { gte: f.dalPrec, lte: f.alPrec }, ...dove },
      _sum: { ricavo: true },
    }),
  ]);

  const prec = new Map(precedenti.map((r) => [r.canale, r._sum.ricavo ?? 0]));
  const perBrand = new Map<
    string,
    { pezzi: number; ricavo: number; prodotti: Map<string, { nome: string; prodottoId: string | null; pezzi: number; ricavo: number }> }
  >();

  for (const r of correnti) {
    const b = perBrand.get(r.canale) ?? { pezzi: 0, ricavo: 0, prodotti: new Map() };
    b.pezzi += r.quantita;
    b.ricavo += r.ricavo;
    const k = r.prodottoId ?? `t:${r.titolo}`;
    const p = b.prodotti.get(k) ?? { nome: r.titolo, prodottoId: r.prodottoId, pezzi: 0, ricavo: 0 };
    p.pezzi += r.quantita;
    p.ricavo += r.ricavo;
    b.prodotti.set(k, p);
    perBrand.set(r.canale, b);
  }

  const ricavoTotale = correnti.reduce((s, r) => s + r.ricavo, 0);
  const nomi = new Map(
    (
      await prisma.prodotto.findMany({
        where: { id: { in: [...new Set(correnti.map((r) => r.prodottoId).filter(Boolean))] as string[] } },
        select: { id: true, nome: true },
      })
    ).map((p) => [p.id, p.nome])
  );

  const brand: RigaBrand[] = [...perBrand.entries()]
    .map(([nome, b]) => {
      const top = [...b.prodotti.values()].sort((x, y) => y.ricavo - x.ricavo)[0] ?? null;
      const ricavoPrec = prec.get(nome) ?? 0;
      return {
        brand: nome,
        pezzi: b.pezzi,
        ricavo: b.ricavo,
        ricavoPrec,
        delta: variazione(b.ricavo, ricavoPrec),
        quota: ricavoTotale > 0 ? b.ricavo / ricavoTotale : 0,
        articoli: b.prodotti.size,
        top: top ? { ...top, nome: (top.prodottoId && nomi.get(top.prodottoId)) || top.nome } : null,
      };
    })
    .sort((a, b) => b.ricavo - a.ricavo);

  const ricavoPrecTotale = [...prec.values()].reduce((s, v) => s + v, 0);
  return {
    finestra: f,
    brand,
    totale: {
      pezzi: correnti.reduce((s, r) => s + r.quantita, 0),
      ricavo: ricavoTotale,
      ricavoPrec: ricavoPrecTotale,
      delta: variazione(ricavoTotale, ricavoPrecTotale),
    },
  };
}

// ---------- Assortimento: categorie e collezioni ----------

export type RigaAssortimento = {
  chiave: string;
  nome: string;
  // Il catalogo: quanti prodotti ci sono e quanti hanno davvero venduto. La
  // differenza è la parte di assortimento che sta ferma in vetrina.
  prodottiACatalogo: number;
  prodottiVenduti: number;
  pezzi: number;
  ricavo: number;
  ricavoPrec: number;
  delta: number | null;
  quota: number;
  prezzoMedio: number;
  margine: number;
  marginePct: number;
  ricavoConCosto: number;
  tendenza: Tendenza;
  top: { prodottoId: string; nome: string; pezzi: number; ricavo: number }[];
};

export type Assortimento = {
  finestra: Finestra;
  categorie: RigaAssortimento[];
  collezioni: RigaAssortimento[];
  // I «tipi» sono quelli scritti sul negozio (Shopify productType): finché le
  // categorie interne non sono assegnate, sono l'unica lettura vera.
  tipi: RigaAssortimento[];
  // Le altre due lenti **importate**: il fornitore (Shopify vendor) e la linea
  // (decisa da noi). Come i tipi, hanno dati veri anche prima che qualcuno tocchi
  // la categoria interna, quindi il report ha qualcosa da dire da subito.
  fornitori: RigaAssortimento[];
  linee: RigaAssortimento[];
  totale: { pezzi: number; ricavo: number; prodottiVenduti: number };
  senzaCosto: number; // prodotti venduti senza costo di produzione
};

/**
 * Analisi per **categoria** e per **collezione**, incrociando il venduto con
 * quello che sappiamo del prodotto (categoria, collezione, costo, prezzo).
 *
 * Conta solo le vendite andate a buon fine, come classifiche e riordino. I
 * prodotti a catalogo che non hanno venduto niente restano contati a parte:
 * una categoria con 40 prodotti e 3 che vendono è una notizia, e sparirebbe
 * guardando solo il fatturato.
 */
export async function analizzaAssortimento(
  giorni: number,
  canale: string | null = null
): Promise<Assortimento> {
  const f = finestra(giorni);
  const dove = {
    ...FILTRO_BUON_FINE,
    ...(canale ? { canale } : {}),
    prodotto: { fase: { not: "archiviato" }, esclusoDaAnalisi: false },
  };

  const [righe, prodotti] = await Promise.all([
    prisma.vendita.findMany({
      where: { data: { gte: f.dalPrec, lte: f.al }, ...dove },
      select: {
        data: true,
        quantita: true,
        ricavo: true,
        prodottoId: true,
        prodotto: {
          select: {
            id: true,
            nome: true,
            categoria: true,
            tipoShopify: true,
            vendorShopify: true,
            lineaId: true,
            linea: { select: { nome: true } },
            costoProduzione: true,
            collezione: { select: { id: true, nome: true } },
          },
        },
        variante: { select: { deltaCosto: true } },
      },
    }),
    prisma.prodotto.findMany({
      where: {
        fase: { not: "archiviato" },
        esclusoDaAnalisi: false,
        ...(canale ? { vendite: { some: { canale } } } : {}),
      },
      select: {
        id: true,
        categoria: true,
        tipoShopify: true,
        vendorShopify: true,
        lineaId: true,
        linea: { select: { nome: true } },
        collezioneId: true,
        collezione: { select: { nome: true } },
      },
    }),
  ]);

  type Acc = {
    chiave: string;
    nome: string;
    pezzi: number;
    ricavo: number;
    ricavoPrec: number;
    margine: number;
    ricavoConCosto: number;
    prodotti: Map<string, { prodottoId: string; nome: string; pezzi: number; ricavo: number }>;
    pezziPrec: number;
  };
  const nuovo = (chiave: string, nome: string): Acc => ({
    chiave,
    nome,
    pezzi: 0,
    ricavo: 0,
    ricavoPrec: 0,
    margine: 0,
    ricavoConCosto: 0,
    prodotti: new Map(),
    pezziPrec: 0,
  });

  const perCategoria = new Map<string, Acc>();
  const perCollezione = new Map<string, Acc>();
  const perTipo = new Map<string, Acc>();
  const perFornitore = new Map<string, Acc>();
  const perLinea = new Map<string, Acc>();
  const senzaCosto = new Set<string>();
  const nomiLinea = new Map<string, string>();

  for (const r of righe) {
    if (!r.prodotto) continue;
    const corrente = r.data >= f.dal;
    const costo = (r.prodotto.costoProduzione || 0) + (r.variante?.deltaCosto || 0);

    const chiaveCat = r.prodotto.categoria;
    const chiaveCol = r.prodotto.collezione?.id ?? "—";
    const nomeCol = r.prodotto.collezione?.nome ?? "Senza collezione";

    const tipo = r.prodotto.tipoShopify?.trim() || "(senza tipo)";
    const forn = r.prodotto.vendorShopify?.trim() || "(senza fornitore)";
    const chiaveLinea = r.prodotto.lineaId ?? "—";
    const nomeLinea = r.prodotto.linea?.nome ?? "Senza linea";
    if (r.prodotto.lineaId && r.prodotto.linea) nomiLinea.set(r.prodotto.lineaId, r.prodotto.linea.nome);

    for (const [mappa, chiave, nome] of [
      [perCategoria, chiaveCat, chiaveCat],
      [perCollezione, chiaveCol, nomeCol],
      [perTipo, tipo, tipo],
      [perFornitore, forn, forn],
      [perLinea, chiaveLinea, nomeLinea],
    ] as const) {
      const a = mappa.get(chiave) ?? nuovo(chiave, nome);
      if (corrente) {
        a.pezzi += r.quantita;
        a.ricavo += r.ricavo;
        if (costo > 0) {
          a.margine += r.ricavo - costo * r.quantita;
          a.ricavoConCosto += r.ricavo;
        }
        const p = a.prodotti.get(r.prodotto.id) ?? {
          prodottoId: r.prodotto.id,
          nome: r.prodotto.nome,
          pezzi: 0,
          ricavo: 0,
        };
        p.pezzi += r.quantita;
        p.ricavo += r.ricavo;
        a.prodotti.set(r.prodotto.id, p);
      } else {
        a.ricavoPrec += r.ricavo;
        a.pezziPrec += r.quantita;
      }
      mappa.set(chiave, a);
    }

    if (corrente && costo <= 0) senzaCosto.add(r.prodotto.id);
  }

  // Quanti prodotti ha ogni categoria/collezione a catalogo, venduti o no.
  const catalogoCat = new Map<string, number>();
  const catalogoTipo = new Map<string, number>();
  const catalogoCol = new Map<string, number>();
  const catalogoForn = new Map<string, number>();
  const catalogoLinea = new Map<string, number>();
  const nomiCol = new Map<string, string>();
  for (const p of prodotti) {
    catalogoCat.set(p.categoria, (catalogoCat.get(p.categoria) ?? 0) + 1);
    const kt = p.tipoShopify?.trim() || "(senza tipo)";
    catalogoTipo.set(kt, (catalogoTipo.get(kt) ?? 0) + 1);
    const kf = p.vendorShopify?.trim() || "(senza fornitore)";
    catalogoForn.set(kf, (catalogoForn.get(kf) ?? 0) + 1);
    const kl = p.lineaId ?? "—";
    catalogoLinea.set(kl, (catalogoLinea.get(kl) ?? 0) + 1);
    if (p.lineaId && p.linea) nomiLinea.set(p.lineaId, p.linea.nome);
    const k = p.collezioneId ?? "—";
    catalogoCol.set(k, (catalogoCol.get(k) ?? 0) + 1);
    if (p.collezioneId && p.collezione) nomiCol.set(p.collezioneId, p.collezione.nome);
  }

  const ricavoTotale = [...perCategoria.values()].reduce((s, a) => s + a.ricavo, 0);

  const componi = (a: Acc, aCatalogo: number): RigaAssortimento => ({
    chiave: a.chiave,
    nome: a.nome,
    prodottiACatalogo: aCatalogo,
    prodottiVenduti: a.prodotti.size,
    pezzi: a.pezzi,
    ricavo: a.ricavo,
    ricavoPrec: a.ricavoPrec,
    delta: variazione(a.ricavo, a.ricavoPrec),
    quota: ricavoTotale > 0 ? a.ricavo / ricavoTotale : 0,
    prezzoMedio: a.pezzi > 0 ? a.ricavo / a.pezzi : 0,
    margine: a.margine,
    marginePct: a.ricavoConCosto > 0 ? a.margine / a.ricavoConCosto : 0,
    ricavoConCosto: a.ricavoConCosto,
    tendenza: classificaTendenza(a.pezzi, a.pezziPrec),
    top: [...a.prodotti.values()].sort((x, y) => y.ricavo - x.ricavo).slice(0, 3),
  });

  // Anche le categorie/collezioni che non hanno venduto niente devono comparire:
  // "zero" è un dato, e senza riga si scambia per "non esiste".
  for (const [cat, quanti] of catalogoCat) if (!perCategoria.has(cat)) perCategoria.set(cat, nuovo(cat, cat));
  for (const [col, quanti] of catalogoCol)
    if (!perCollezione.has(col)) perCollezione.set(col, nuovo(col, col === "—" ? "Senza collezione" : nomiCol.get(col) ?? col));
  for (const [tipo] of catalogoTipo) if (!perTipo.has(tipo)) perTipo.set(tipo, nuovo(tipo, tipo));
  for (const [forn] of catalogoForn) if (!perFornitore.has(forn)) perFornitore.set(forn, nuovo(forn, forn));
  for (const [lin] of catalogoLinea)
    if (!perLinea.has(lin)) perLinea.set(lin, nuovo(lin, lin === "—" ? "Senza linea" : nomiLinea.get(lin) ?? lin));

  return {
    finestra: f,
    categorie: [...perCategoria.values()]
      .map((a) => componi(a, catalogoCat.get(a.chiave) ?? 0))
      .sort((a, b) => b.ricavo - a.ricavo),
    collezioni: [...perCollezione.values()]
      .map((a) => componi(a, catalogoCol.get(a.chiave) ?? 0))
      .sort((a, b) => b.ricavo - a.ricavo),
    tipi: [...perTipo.values()]
      .map((a) => componi(a, catalogoTipo.get(a.chiave) ?? 0))
      .sort((a, b) => b.ricavo - a.ricavo),
    fornitori: [...perFornitore.values()]
      .map((a) => componi(a, catalogoForn.get(a.chiave) ?? 0))
      .sort((a, b) => b.ricavo - a.ricavo),
    linee: [...perLinea.values()]
      .map((a) => componi(a, catalogoLinea.get(a.chiave) ?? 0))
      .sort((a, b) => b.ricavo - a.ricavo),
    totale: {
      pezzi: [...perCategoria.values()].reduce((s, a) => s + a.pezzi, 0),
      ricavo: ricavoTotale,
      prodottiVenduti: new Set(righe.filter((r) => r.data >= f.dal && r.prodottoId).map((r) => r.prodottoId)).size,
    },
    senzaCosto: senzaCosto.size,
  };
}

// ---------- Classifiche ----------

export type VoceClassifica = {
  chiave: string;
  nome: string;
  dettaglio: string | null; // codice, variante
  prodottoId: string | null;
  immagine: string | null;
  pezzi: number;
  ricavo: number;
  righe: number; // quante volte è finito in un ordine
  prezzoMedio: number;
  quotaPezzi: number;
  quotaRicavo: number;
  posQuantita: number;
  posValore: number;
  canali: string[];
};

export type Classifiche = {
  finestra: Finestra;
  vista: "prodotti" | "varianti";
  canale: string | null;
  soloBuonFine: boolean;
  perQuantita: VoceClassifica[];
  perValore: VoceClassifica[];
  totale: { pezzi: number; ricavo: number; articoli: number; righe: number };
  // Cosa è rimasto fuori perché non è una vendita andata a buon fine.
  escluso: { righe: number; pezzi: number; ricavo: number; perStato: { stato: string; ricavo: number; righe: number }[] };
  canaliDisponibili: string[];
};

/**
 * Le classifiche del venduto: gli stessi articoli ordinati per quantità e per
 * valore, su tutti i brand o su uno solo.
 *
 * Di default contano solo le **vendite andate a buon fine** (vedi
 * `FILTRO_BUON_FINE`): una classifica che premia un prodotto rimborsato dice
 * il falso proprio a chi deve decidere cosa produrre e cosa spingere.
 */
export async function classifiche(opzioni: {
  giorni: number;
  canale?: string | null;
  vista?: "prodotti" | "varianti";
  soloBuonFine?: boolean;
  limite?: number;
}): Promise<Classifiche> {
  const vista = opzioni.vista ?? "prodotti";
  const soloBuonFine = opzioni.soloBuonFine ?? true;
  const limite = opzioni.limite ?? 25;
  const f = finestra(opzioni.giorni);

  const [righe, canali] = await Promise.all([
    prisma.vendita.findMany({
      where: {
        data: { gte: f.dal, lte: f.al },
        ...(opzioni.canale ? { canale: opzioni.canale } : {}),
        // I prodotti archiviati restano fuori dalle classifiche. È la leva con
        // cui una persona toglie ciò che prodotto non è — le righe di servizio
        // dei negozi ("_Additional Price", supplementi, spese) che altrimenti
        // vincono la classifica dei pezzi senza vendere niente. Riconoscerle dal
        // nome sarebbe indovinare: archiviarle è una decisione, e si vede.
        OR: [{ prodottoId: null }, { prodotto: { fase: { not: "archiviato" }, esclusoDaAnalisi: false } }],
      },
      select: {
        prodottoId: true,
        varianteId: true,
        titolo: true,
        varianteNome: true,
        sku: true,
        canale: true,
        quantita: true,
        ricavo: true,
        statoPagamento: true,
        prodotto: { select: { nome: true, codice: true, immagine: true } },
        variante: { select: { nome: true } },
      },
    }),
    prisma.vendita.findMany({ distinct: ["canale"], select: { canale: true }, orderBy: { canale: "asc" } }),
  ]);

  const aBuonFine = (r: { statoPagamento: string | null }) =>
    (PAGAMENTI_BUON_FINE as readonly string[]).includes(r.statoPagamento ?? "");
  const buone = soloBuonFine ? righe.filter(aBuonFine) : righe;
  // Le scartate si calcolano sempre: anche mostrando tutto serve dire quanto
  // del venduto non è una vendita vera.
  const fuori = righe.filter((r) => !aBuonFine(r));

  const gruppi = new Map<string, VoceClassifica & { canaliSet: Set<string> }>();
  for (const r of buone) {
    const chiave =
      vista === "varianti"
        ? r.varianteId ?? `${r.prodottoId ?? r.titolo}|${r.varianteNome ?? r.sku ?? "—"}`
        : r.prodottoId ?? `titolo:${r.titolo.trim().toLowerCase()}`;
    const nome = r.prodotto?.nome ?? r.titolo;
    const variante = r.variante?.nome ?? r.varianteNome;
    const dettaglio =
      vista === "varianti"
        ? [r.prodotto?.codice, variante ?? "senza variante"].filter(Boolean).join(" · ")
        : r.prodotto?.codice ?? "non a catalogo";

    const g =
      gruppi.get(chiave) ??
      ({
        chiave,
        nome,
        dettaglio,
        prodottoId: r.prodottoId,
        immagine: r.prodotto?.immagine ?? null,
        pezzi: 0,
        ricavo: 0,
        righe: 0,
        prezzoMedio: 0,
        quotaPezzi: 0,
        quotaRicavo: 0,
        posQuantita: 0,
        posValore: 0,
        canali: [],
        canaliSet: new Set<string>(),
      } as VoceClassifica & { canaliSet: Set<string> });
    g.pezzi += r.quantita;
    g.ricavo += r.ricavo;
    g.righe += 1;
    g.canaliSet.add(r.canale);
    gruppi.set(chiave, g);
  }

  const totalePezzi = buone.reduce((s, r) => s + r.quantita, 0);
  const totaleRicavo = buone.reduce((s, r) => s + r.ricavo, 0);

  const voci = [...gruppi.values()].map((g) => ({
    ...g,
    canali: [...g.canaliSet].sort(),
    prezzoMedio: g.pezzi > 0 ? g.ricavo / g.pezzi : 0,
    quotaPezzi: totalePezzi > 0 ? g.pezzi / totalePezzi : 0,
    quotaRicavo: totaleRicavo > 0 ? g.ricavo / totaleRicavo : 0,
  }));

  // Le due graduatorie: a parità si guarda l'altra grandezza, così l'ordine è
  // stabile e non dipende da come sono usciti i record dal database.
  const perQta = [...voci].sort((a, b) => b.pezzi - a.pezzi || b.ricavo - a.ricavo);
  const perVal = [...voci].sort((a, b) => b.ricavo - a.ricavo || b.pezzi - a.pezzi);
  perQta.forEach((v, i) => (v.posQuantita = i + 1));
  perVal.forEach((v, i) => (v.posValore = i + 1));

  const perStato = new Map<string, { stato: string; ricavo: number; righe: number }>();
  for (const r of fuori) {
    const k = r.statoPagamento ?? "SCONOSCIUTO";
    const v = perStato.get(k) ?? { stato: k, ricavo: 0, righe: 0 };
    v.ricavo += r.ricavo;
    v.righe += 1;
    perStato.set(k, v);
  }

  return {
    finestra: f,
    vista,
    canale: opzioni.canale ?? null,
    soloBuonFine,
    perQuantita: perQta.slice(0, limite),
    perValore: perVal.slice(0, limite),
    totale: { pezzi: totalePezzi, ricavo: totaleRicavo, articoli: voci.length, righe: buone.length },
    escluso: {
      righe: fuori.length,
      pezzi: fuori.reduce((s, r) => s + r.quantita, 0),
      ricavo: fuori.reduce((s, r) => s + r.ricavo, 0),
      perStato: [...perStato.values()].sort((a, b) => b.ricavo - a.ricavo),
    },
    canaliDisponibili: canali.map((c) => c.canale),
  };
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
