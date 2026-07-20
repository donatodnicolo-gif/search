// Motore di calcolo: scenari su 3 livelli, costo del personale e P&L.
// Tutto ciò che è derivato (livelli sfidante/irraggiungibile, margini,
// risultato operativo, ADV consentito, costo azienda delle persone) si calcola
// qui a partire dai dati salvati a DB — mai memorizzato a mano.
import { prisma } from "./db";

export const ANNO_CORRENTE = 2026;

export type Livello = "RAGGIUNGIBILE" | "SFIDANTE" | "IRRAGGIUNGIBILE";

export const LIVELLI: { key: Livello; label: string; badge: string }[] = [
  { key: "RAGGIUNGIBILE", label: "Raggiungibile", badge: "green" },
  { key: "SFIDANTE", label: "Sfidante", badge: "gold" },
  { key: "IRRAGGIUNGIBILE", label: "Irraggiungibile", badge: "purple" },
];

export const CANALI = ["D2C", "EVENTI", "B2B"] as const;
export type Canale = (typeof CANALI)[number];

export const TIPI_PERSONA = [
  { key: "DIPENDENTE", label: "Dipendente", badge: "blue" },
  { key: "STAGISTA", label: "Stagista", badge: "neutral" },
  { key: "CONSULENTE", label: "Consulente", badge: "gold" },
] as const;

export type Persona = {
  id: string;
  nome: string;
  ruolo: string | null;
  tipo: string;
  importo: number;
  superminimo: number;
  partTimePct: number;
  periodicita: string;
  contributiPct: number;
  mensilita: number;
  inpsPct: number;
  addizionaliPct: number;
  mesi: number[];
  maisonId: string | null;
  teamId: string | null;
  note: string | null;
};

export type TeamBudget = {
  id: string;
  nome: string;
  responsabile: string | null;
  colore: string | null;
  ordine: number;
  note: string | null;
};

export type MaisonBudget = {
  id: string;
  slug: string;
  nome: string;
  ordine: number;
  // vendite pubblicate per mese (1..12) e canale
  mesi: { month: number; d2c: number; eventi: number; b2b: number; advPercent: number; advPubblicato: number }[];
};

export type DatiAnno = {
  year: number;
  maisons: MaisonBudget[];
  scenari: { livello: Livello; moltiplicatore: number; premio: number; note: string | null }[];
  costi: { id: string; tipo: string; label: string; valore: number; maisonId: string | null }[];
  persone: Persona[];
  team: TeamBudget[];
};

export async function caricaAnno(year = ANNO_CORRENTE): Promise<DatiAnno> {
  const [maisons, entries, advs, scenari, costi, dipendenti, team] = await Promise.all([
    prisma.maison.findMany({ orderBy: { ordine: "asc" } }),
    prisma.budgetEntry.findMany({ where: { year } }),
    prisma.advPercent.findMany({ where: { year } }),
    prisma.scenarioConfig.findMany({ where: { year } }),
    prisma.costConfig.findMany({ where: { year } }),
    prisma.dipendente.findMany({ where: { year }, orderBy: { nome: "asc" } }),
    prisma.team.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
  ]);

  const out: MaisonBudget[] = maisons.map((m) => {
    const mesi = [];
    for (let month = 1; month <= 12; month++) {
      const get = (canale: string) =>
        entries.find((e) => e.maisonId === m.id && e.month === month && e.canale === canale)?.vendite ?? 0;
      const adv = advs.find((a) => a.maisonId === m.id && a.month === month);
      mesi.push({
        month,
        d2c: get("D2C"),
        eventi: get("EVENTI"),
        b2b: get("B2B"),
        advPercent: adv?.percent ?? 0,
        advPubblicato: adv?.budgetPubblicato ?? 0,
      });
    }
    return { id: m.id, slug: m.slug, nome: m.nome, ordine: m.ordine, mesi };
  });

  return {
    year,
    maisons: out,
    scenari: scenari.map((s) => ({
      livello: s.livello as Livello,
      moltiplicatore: s.moltiplicatore,
      premio: s.premio,
      note: s.note,
    })),
    costi,
    persone: dipendenti.map((d) => ({
      id: d.id,
      nome: d.nome,
      ruolo: d.ruolo,
      tipo: d.tipo,
      importo: d.importo,
      superminimo: d.superminimo,
      partTimePct: d.partTimePct,
      periodicita: d.periodicita,
      contributiPct: d.contributiPct,
      mensilita: d.mensilita,
      inpsPct: d.inpsPct,
      addizionaliPct: d.addizionaliPct,
      mesi: leggiMesi(d.mesi),
      maisonId: d.maisonId,
      teamId: d.teamId,
      note: d.note,
    })),
    team: team.map((t) => ({
      id: t.id,
      nome: t.nome,
      responsabile: t.responsabile,
      colore: t.colore,
      ordine: t.ordine,
      note: t.note,
    })),
  };
}

export function leggiMesi(json: string): number[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.map(Number).filter((n) => n >= 1 && n <= 12).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function moltiplicatore(dati: DatiAnno, livello: Livello): number {
  return dati.scenari.find((s) => s.livello === livello)?.moltiplicatore ?? 1;
}

export function premio(dati: DatiAnno, livello: Livello): number {
  return dati.scenari.find((s) => s.livello === livello)?.premio ?? 0;
}

export function totaliMaison(m: MaisonBudget) {
  const d2c = m.mesi.reduce((s, x) => s + x.d2c, 0);
  const eventi = m.mesi.reduce((s, x) => s + x.eventi, 0);
  const b2b = m.mesi.reduce((s, x) => s + x.b2b, 0);
  const adv = m.mesi.reduce((s, x) => s + advConsentitoMese(x), 0);
  const advPubblicato = m.mesi.reduce((s, x) => s + x.advPubblicato, 0);
  return { d2c, eventi, b2b, totale: d2c + eventi + b2b, adv, advPubblicato };
}

// ADV consentito nel mese = vendite del mese × % impostata in /spese.
export function advConsentitoMese(mese: MaisonBudget["mesi"][number]): number {
  const vendite = mese.d2c + mese.eventi + mese.b2b;
  return (vendite * mese.advPercent) / 100;
}

// ---------- Costo del personale ----------

// Lordo annuo effettivo: tabellare + superminimo individuale, riproporzionati
// per la percentuale di part-time (100 = tempo pieno). Senza oneri.
export function lordoAnnuo(p: Persona): number {
  const pieno = p.periodicita === "ANNUO" ? p.importo + p.superminimo : (p.importo + p.superminimo) * 12;
  return (pieno * p.partTimePct) / 100;
}

// Costo azienda di una persona in un dato mese: zero se quel mese non è tra
// quelli di competenza. Il lordo (già riproporzionato per il part-time) si
// spalma su 12 mensilità e gli oneri si applicano sopra.
export function costoPersonaMese(p: Persona, month: number): number {
  if (!p.mesi.includes(month)) return 0;
  return (lordoAnnuo(p) / 12) * (1 + p.contributiPct / 100);
}

export function costoPersonaAnno(p: Persona): number {
  let tot = 0;
  for (let m = 1; m <= 12; m++) tot += costoPersonaMese(p, m);
  return tot;
}

// Costo del personale dell'anno, eventualmente della sola maison indicata.
export function costoPersonale(dati: DatiAnno, maisonId?: string | null): number {
  const persone = maisonId ? dati.persone.filter((p) => p.maisonId === maisonId) : dati.persone;
  return persone.reduce((s, p) => s + costoPersonaAnno(p), 0);
}

// ---------- Dal lordo al netto in busta (stima) ----------
//
// Stima di pianificazione, non un cedolino: IRPEF a scaglioni 2025
// (23% / 35% / 43%), detrazione da lavoro dipendente art. 13 TUIR, contributi
// a carico del dipendente e addizionali regionale+comunale come aliquota unica.
// Non considera trattamento integrativo, detrazioni per familiari, fringe
// benefit, premi di risultato a tassazione agevolata né conguagli.

const SCAGLIONI = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.35 },
  { fino: Infinity, aliquota: 0.43 },
];

export function irpefLorda(imponibile: number): number {
  let imposta = 0;
  let precedente = 0;
  for (const s of SCAGLIONI) {
    if (imponibile <= precedente) break;
    imposta += (Math.min(imponibile, s.fino) - precedente) * s.aliquota;
    precedente = s.fino;
  }
  return imposta;
}

// Detrazione per redditi da lavoro dipendente (art. 13 c.1 TUIR).
export function detrazioneLavoro(reddito: number): number {
  if (reddito <= 15000) return Math.max(690, 1955);
  if (reddito <= 28000) return 1910 + 1190 * ((28000 - reddito) / 13000);
  if (reddito <= 50000) return 1910 * ((50000 - reddito) / 22000);
  return 0;
}

// Cuneo fiscale (legge di bilancio 2025): sotto i 20.000 € è una somma in
// busta calcolata sul reddito di lavoro; tra 20.000 e 40.000 è un'ulteriore
// detrazione che si azzera progressivamente.
// ATTENZIONE: parametri 2025. Vanno riverificati con la legge di bilancio
// dell'anno di budget prima di usare il netto per trattative o contratti.
export function cuneoFiscale(reddito: number): number {
  if (reddito <= 8500) return reddito * 0.071;
  if (reddito <= 15000) return reddito * 0.053;
  if (reddito <= 20000) return reddito * 0.048;
  if (reddito <= 32000) return 1000;
  if (reddito <= 40000) return 1000 * ((40000 - reddito) / 8000);
  return 0;
}

export type Netto = {
  lordoPeriodo: number;
  contributi: number;
  imponibile: number;
  irpef: number;
  addizionali: number;
  cuneo: number;
  nettoPeriodo: number;
  nettoMese: number; // netto della singola busta paga
  buste: number;
};

// Il netto ha senso per il lavoro dipendente: consulenti (fattura) e stagisti
// (rimborso) seguono regole diverse, quindi lì non si stima.
export function haNetto(p: Persona): boolean {
  return p.tipo === "DIPENDENTE";
}

export function nettoBusta(p: Persona): Netto | null {
  if (!haNetto(p)) return null;
  // Chi lavora solo parte dell'anno matura reddito e detrazioni in proporzione.
  const quotaAnno = p.mesi.length / 12;
  const lordoPeriodo = lordoAnnuo(p) * quotaAnno;
  const contributi = (lordoPeriodo * p.inpsPct) / 100;
  const imponibile = lordoPeriodo - contributi;
  const irpef = Math.max(0, irpefLorda(imponibile) - detrazioneLavoro(imponibile) * quotaAnno);
  const addizionali = (imponibile * p.addizionaliPct) / 100;
  const cuneo = cuneoFiscale(imponibile) * quotaAnno;
  const nettoPeriodo = imponibile - irpef - addizionali + cuneo;
  const buste = Math.max(1, p.mensilita * quotaAnno);
  return {
    lordoPeriodo,
    contributi,
    imponibile,
    irpef,
    addizionali,
    cuneo,
    nettoPeriodo,
    nettoMese: nettoPeriodo / buste,
    buste,
  };
}

// Costo del lavoro di un team. `null` = persone senza team assegnato.
export function costoTeam(dati: DatiAnno, teamId: string | null): number {
  return dati.persone
    .filter((p) => p.teamId === teamId)
    .reduce((s, p) => s + costoPersonaAnno(p), 0);
}

export function personeDelTeam(dati: DatiAnno, teamId: string | null): Persona[] {
  return dati.persone.filter((p) => p.teamId === teamId);
}

export function costoPersonaleMese(dati: DatiAnno, month: number, maisonId?: string | null): number {
  const persone = maisonId ? dati.persone.filter((p) => p.maisonId === maisonId) : dati.persone;
  return persone.reduce((s, p) => s + costoPersonaMese(p, month), 0);
}

// ---------- Conto economico ----------

export type PL = {
  livello: Livello;
  moltiplicatore: number;
  ricavi: number;
  ricaviD2c: number;
  ricaviEventi: number;
  ricaviB2b: number;
  cogs: number;
  cogsPct: number;
  margineLordo: number;
  adv: number;
  personale: number;
  costiFissi: number;
  ebitda: number;
  premio: number;
  risultatoNetto: number;
  ebitdaPct: number;
};

// Voci di costo configurate, sommate per tipo. Se `maisonId` è indicata si
// prendono le voci globali (ripartite altrove) e quelle della maison.
function sommaCosti(dati: DatiAnno, tipo: string, maisonIds?: string[]): number {
  return dati.costi
    .filter((c) => c.tipo === tipo)
    .filter((c) => (maisonIds ? c.maisonId === null || maisonIds.includes(c.maisonId) : true))
    .reduce((s, c) => s + c.valore, 0);
}

// P&L dell'anno per un livello di scenario. Vendite e ADV scalano con il
// moltiplicatore; personale e costi fissi no (sono impegni già presi).
export function contoEconomico(dati: DatiAnno, livello: Livello, maisonSlug?: string): PL {
  const molt = moltiplicatore(dati, livello);
  const maisons = maisonSlug ? dati.maisons.filter((m) => m.slug === maisonSlug) : dati.maisons;
  const ids = maisons.map((m) => m.id);

  const tot = maisons.map(totaliMaison);
  const venditeBase = tot.reduce((s, t) => s + t.totale, 0);
  const advBase = tot.reduce((s, t) => s + t.adv, 0);
  const venditeTotali = dati.maisons.reduce((s, m) => s + totaliMaison(m).totale, 0);

  const cogsPct = sommaCosti(dati, "COGS_PCT", maisonSlug ? ids : undefined);
  const fissi = sommaCosti(dati, "FISSO_MENSILE", ids) * 12 + sommaCosti(dati, "FISSO_ANNUO", ids);

  // Nel P&L di una singola maison i costi comuni (struttura, personale non
  // attribuito, premi) si ripartiscono in proporzione ai ricavi.
  const quota = maisonSlug && venditeTotali > 0 ? venditeBase / venditeTotali : 1;

  const ricavi = venditeBase * molt;
  const cogs = (ricavi * cogsPct) / 100;
  const margineLordo = ricavi - cogs;
  const adv = advBase * molt;
  const personale = maisonSlug
    ? costoPersonale(dati, null) * quota + ids.reduce((s, id) => s + costoPersonale(dati, id), 0)
    : dati.persone.reduce((s, p) => s + costoPersonaAnno(p), 0);
  const costiFissi = fissi * quota;
  const ebitda = margineLordo - adv - personale - costiFissi;
  const p = premio(dati, livello) * quota;

  return {
    livello,
    moltiplicatore: molt,
    ricavi,
    ricaviD2c: tot.reduce((s, t) => s + t.d2c, 0) * molt,
    ricaviEventi: tot.reduce((s, t) => s + t.eventi, 0) * molt,
    ricaviB2b: tot.reduce((s, t) => s + t.b2b, 0) * molt,
    cogs,
    cogsPct,
    margineLordo,
    adv,
    personale,
    costiFissi,
    ebitda,
    premio: p,
    risultatoNetto: ebitda - p,
    ebitdaPct: ricavi > 0 ? (ebitda / ricavi) * 100 : 0,
  };
}

export type PLMese = {
  month: number;
  ricavi: number;
  cogs: number;
  margineLordo: number;
  adv: number;
  personale: number;
  costiFissi: number;
  ebitda: number;
};

// P&L mese per mese: serve a vedere dove il risultato va sotto zero (i costi
// fissi e il personale non seguono la stagionalità delle vendite).
export function contoEconomicoMensile(dati: DatiAnno, livello: Livello): PLMese[] {
  const molt = moltiplicatore(dati, livello);
  const cogsPct = sommaCosti(dati, "COGS_PCT");
  const fissiMese = sommaCosti(dati, "FISSO_MENSILE") + sommaCosti(dati, "FISSO_ANNUO") / 12;

  const righe: PLMese[] = [];
  for (let month = 1; month <= 12; month++) {
    const ricavi =
      dati.maisons.reduce((s, m) => {
        const x = m.mesi.find((y) => y.month === month);
        return s + (x ? x.d2c + x.eventi + x.b2b : 0);
      }, 0) * molt;
    const adv =
      dati.maisons.reduce((s, m) => {
        const x = m.mesi.find((y) => y.month === month);
        return s + (x ? advConsentitoMese(x) : 0);
      }, 0) * molt;
    const cogs = (ricavi * cogsPct) / 100;
    const personale = costoPersonaleMese(dati, month);
    const margineLordo = ricavi - cogs;
    righe.push({
      month,
      ricavi,
      cogs,
      margineLordo,
      adv,
      personale,
      costiFissi: fissiMese,
      ebitda: margineLordo - adv - personale - fissiMese,
    });
  }
  return righe;
}
