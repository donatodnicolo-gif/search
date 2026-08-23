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

// Tipologia di servizio venduto, con il suo margine. Le tre di partenza
// (D2C, Eventi, B2B) vengono dal budget pubblicato; altre si aggiungono da
// /margini.
export type Tipologia = {
  id: string;
  slug: string;
  nome: string;
  marginePct: number;
  ordine: number;
  note: string | null;
  vociFinance: string[]; // nomi tipologie Finance mappate su questa voce
};

// Legge la lista di voci Finance (JSON array) tollerando dati vecchi/vuoti.
export function leggiVociFinance(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

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
  // Persona con un budget proprio: risponde di un numero e lo propone.
  budget: boolean;
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

// **Da dove nasce un pezzo di budget.** Non è un'etichetta descrittiva: decide
// che cosa un consolidamento sovrascrive. Ogni squadra scrive solo la propria
// riga, e il budget del mese è la somma di tutte.
export const FONTI = [
  { key: "iniziale", nome: "Budget iniziale", aiuto: "quello che veniva dal file di monitoraggio caricato a inizio anno" },
  { key: "adv-web", nome: "Pubblicità web", aiuto: "le vendite che nascono dalle campagne: le propone chi gestisce l'ADV" },
  { key: "commerciale", nome: "Team commerciale", aiuto: "quello che porta la rete di vendita, sopra il resto" },
];

export const nomeFonte = (key: string) => FONTI.find((f) => f.key === key)?.nome ?? key;

// **Il budget iniziale è un punto di partenza, non un addendo.**
//
// Il totale di una casella non è la somma di tutto quello che c'è dentro: le
// proposte (pubblicità web, team commerciale) **si sommano fra loro**, ma
// **sostituiscono** il budget che veniva dal file di monitoraggio. Il nuovo
// budget rimpiazza il precedente; solo dove nessuno ha ancora proposto vale
// ancora quello iniziale.
//
// Senza questa regola su Deluxy.it il D2C di luglio valeva **105.000 €** invece
// di 50.000: 55.000 finiti in `iniziale` da un consolidamento fatto prima che
// la colonna `fonte` esistesse, più i 50.000 della proposta nuova. Un totale
// che somma il vecchio e il nuovo non è il budget di nessuno.
export const INIZIALE = "iniziale";

export function venditeApplicate(perFonteCanale: Record<string, number> | undefined): number {
  if (!perFonteCanale) return 0;
  const daProposte = Object.entries(perFonteCanale).filter(([f]) => f !== INIZIALE);
  if (daProposte.length > 0) return daProposte.reduce((s, [, v]) => s + v, 0);
  return perFonteCanale[INIZIALE] ?? 0;
}

// `true` quando su quella casella una proposta ha parlato, quindi il valore
// iniziale non conta più. Serve alla pagina per mostrarlo barrato invece di
// farlo sparire: chi guarda deve capire che è stato **sostituito**, non perso.
export const inizialeSuperato = (perFonteCanale: Record<string, number> | undefined): boolean =>
  Object.keys(perFonteCanale ?? {}).some((f) => f !== INIZIALE);

export type MeseMaison = {
  month: number;
  // vendite pubblicate per slug di tipologia: **la somma di tutte le fonti**
  vendite: Record<string, number>;
  // Le stesse vendite spaccate per fonte — `vendite[canale]` è la somma di
  // `perFonte[canale][*]`. Serve a far vedere di chi è ogni pezzo, e a far
  // sovrascrivere a ciascuna squadra solo il suo.
  perFonte: Record<string, Record<string, number>>;
  advPercent: number;
  advPubblicato: number;
};

export type PiattaformaAdv = {
  id: string;
  nome: string;
  colore: string | null;
  ordine: number;
  note: string | null;
  // % per mese (1..12): quanta parte del budget ADV del mese va qui
  split: Record<number, number>;
};

export type MaisonBudget = {
  id: string;
  slug: string;
  nome: string;
  ordine: number;
  mesi: MeseMaison[];
};

export type DatiAnno = {
  year: number;
  maisons: MaisonBudget[];
  scenari: { livello: Livello; moltiplicatore: number; premio: number; note: string | null }[];
  costi: { id: string; tipo: string; label: string; valore: number; maisonId: string | null }[];
  persone: Persona[];
  team: TeamBudget[];
  tipologie: Tipologia[];
  piattaforme: PiattaformaAdv[];
};

export async function caricaAnno(year = ANNO_CORRENTE): Promise<DatiAnno> {
  const [maisons, entries, advs, scenari, costi, dipendenti, team, tipologie, piattaforme, split] =
    await Promise.all([
      prisma.maison.findMany({ orderBy: { ordine: "asc" } }),
      prisma.budgetEntry.findMany({ where: { year } }),
      prisma.advPercent.findMany({ where: { year } }),
      prisma.scenarioConfig.findMany({ where: { year } }),
      prisma.costConfig.findMany({ where: { year } }),
      prisma.dipendente.findMany({ where: { year }, orderBy: { nome: "asc" } }),
      prisma.team.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
      prisma.tipologiaServizio.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
      prisma.piattaformaAdv.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
      prisma.piattaformaSplit.findMany({ where: { year } }),
    ]);

  const out: MaisonBudget[] = maisons.map((m) => {
    const mesi: MeseMaison[] = [];
    for (let month = 1; month <= 12; month++) {
      const adv = advs.find((a) => a.maisonId === m.id && a.month === month);
      // **Il budget di un canale è la SOMMA delle sue fonti**, non una riga
      // sola: sullo stesso mese ci scrivono la pubblicità web e il team
      // commerciale, e prima di questo (31/07/2026) l'una cancellava l'altra
      // perché la casella era una.
      const vendite: Record<string, number> = {};
      const perFonte: Record<string, Record<string, number>> = {};
      for (const t of tipologie) {
        const righe = entries.filter((e) => e.maisonId === m.id && e.month === month && e.canale === t.slug);
        perFonte[t.slug] = {};
        for (const e of righe) perFonte[t.slug][e.fonte] = (perFonte[t.slug][e.fonte] ?? 0) + e.vendite;
        // Le proposte si sommano fra loro e **sostituiscono** il budget
        // iniziale: il nuovo rimpiazza il precedente, non ci si aggiunge.
        vendite[t.slug] = venditeApplicate(perFonte[t.slug]);
      }
      mesi.push({
        month,
        vendite,
        perFonte,
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
      budget: d.budget,
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
    tipologie: tipologie.map((t) => ({
      id: t.id,
      slug: t.slug,
      nome: t.nome,
      marginePct: t.marginePct,
      ordine: t.ordine,
      note: t.note,
      vociFinance: leggiVociFinance(t.vociFinance),
    })),
    piattaforme: piattaforme.map((p) => {
      const s: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) {
        s[m] = split.find((x) => x.piattaformaId === p.id && x.month === m)?.percent ?? 0;
      }
      return { id: p.id, nome: p.nome, colore: p.colore, ordine: p.ordine, note: p.note, split: s };
    }),
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

// Vendite totali del mese, su tutte le tipologie.
export function venditeMese(mese: MeseMaison): number {
  return Object.values(mese.vendite).reduce((s, v) => s + v, 0);
}

export function totaliMaison(m: MaisonBudget) {
  const perServizio: Record<string, number> = {};
  for (const mese of m.mesi) {
    for (const [slug, v] of Object.entries(mese.vendite)) {
      perServizio[slug] = (perServizio[slug] ?? 0) + v;
    }
  }
  const totale = Object.values(perServizio).reduce((s, v) => s + v, 0);
  const advPubblicato = m.mesi.reduce((s, x) => s + x.advPubblicato, 0);
  const adv = m.mesi.reduce((s, x) => s + advConsentitoMese(x, budgetAdvAnno(m)), 0);
  return { perServizio, totale, adv, advPubblicato };
}

// ---------- Il budget pubblicitario del mese ----------
//
// **La percentuale di /spese è una quota del budget pubblicitario dell'anno,
// non una percentuale delle vendite del mese** (regola dell'utente, 23/08/2026:
// «sono da calcolare su totale pubblicità prevista per l'anno»). Ogni brand ha
// un monte pubblicità per l'anno — l'ADV **pubblicato**, quello del
// monitoraggio — e le dodici caselle dicono **come si distribuisce fra i mesi**:
// per questo devono sommare 100 e non possono sforare.
//
// Prima qui c'era «vendite del mese × %», che è una domanda diversa («quanto
// posso spendere dato quanto vendo») e faceva due danni: le dodici percentuali
// non avevano nessun vincolo fra loro, e un mese senza budget di vendita
// portava a zero la sua pubblicità anche quando il monte annuo c'era tutto.
export function advPubblicatoAnno(m: MaisonBudget): number {
  return m.mesi.reduce((s, x) => s + x.advPubblicato, 0);
}

// ---------- Quanto vale il monte pubblicitario dell'anno ----------
//
// **Non è più un numero ereditato: si stima dal ROS obiettivo** (regola
// dell'utente, 23/08/2026: «stima in automatico il budget pubblicitario pari a
// 7 per deluxy.it e 6,5 per tutti gli altri siti»). Il ROS è quanti euro di
// vendite deve muovere ogni euro speso, quindi il conto si rovescia:
//
//     budget pubblicità dell'anno = vendite a budget dell'anno ÷ ROS obiettivo
//
// A ROS 7 la pubblicità vale un settimo del venduto (≈14,3%), a 6,5 un po' di
// più (≈15,4%).
//
// ⚠️ La base sono le **vendite a budget**, non il venduto vero dei mesi già
// chiusi. Due ragioni: un budget che si muove ogni volta che arriva un ordine
// non è un budget; e questo conto deve poter girare **anche dove non c'è
// Orders** — dentro il P&L e in `/piattaforme`, che sono sincroni — altrimenti
// il monte annuo varrebbe una cosa nella pagina dove si scrive e un'altra dove
// si legge.
export const ROS_OBIETTIVO_PREDEFINITO = 6.5;
const ROS_OBIETTIVO: Record<string, number> = { deluxy: 7 };

export function rosObiettivo(slug: string): number {
  return ROS_OBIETTIVO[slug] ?? ROS_OBIETTIVO_PREDEFINITO;
}

export function budgetAdvAnno(m: MaisonBudget): number {
  const ros = rosObiettivo(m.slug);
  if (ros <= 0) return 0;
  const vendite = m.mesi.reduce((s, x) => s + venditeMese(x), 0);
  return vendite / ros;
}

export function advConsentitoMese(mese: MeseMaison, budgetAnno: number): number {
  return (budgetAnno * mese.advPercent) / 100;
}

// Budget ADV dell'intera azienda in un mese (somma su tutte le maison): è la
// base che si ripartisce tra le piattaforme in /piattaforme.
export function advBudgetMese(dati: DatiAnno, month: number): number {
  return dati.maisons.reduce((s, m) => {
    const x = m.mesi.find((y) => y.month === month);
    return s + (x ? advConsentitoMese(x, budgetAdvAnno(m)) : 0);
  }, 0);
}

export function advBudgetAnno(dati: DatiAnno): number {
  let tot = 0;
  for (let m = 1; m <= 12; m++) tot += advBudgetMese(dati, m);
  return tot;
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
  ricaviPerServizio: Record<string, number>; // slug tipologia → ricavi
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

// Margine di una tipologia. Una tipologia sconosciuta (dato vecchio rimasto in
// un BudgetEntry) vale margine zero: meglio un margine prudenziale che ignorare
// il ricavo e gonfiare il risultato.
export function margineDi(dati: DatiAnno, slug: string): number {
  return dati.tipologie.find((t) => t.slug === slug)?.marginePct ?? 0;
}

// Voci di costo configurate, sommate per tipo. Se `maisonId` è indicata si
// prendono le voci globali (ripartite altrove) e quelle della maison.
function sommaCosti(dati: DatiAnno, tipo: string, maisonIds?: string[]): number {
  return dati.costi
    .filter((c) => c.tipo === tipo)
    .filter((c) => (maisonIds ? c.maisonId === null || maisonIds.includes(c.maisonId) : true))
    .reduce((s, c) => s + c.valore, 0);
}

// Slug della tipologia che copre il venduto diretto al consumatore.
const SLUG_D2C = "D2C";

// P&L dell'anno per un livello di scenario. Vendite e ADV scalano con il
// moltiplicatore; personale e costi fissi no (sono impegni già presi).
//
// `quotaD2C` è la quota del venduto che resta a Deluxy (modello C: sull'ecommerce
// Deluxy è un intermediario, quindi a conto economico entra la provvigione, non
// il prezzo pieno pagato dal cliente). Il budget continua a scriversi sul
// **venduto** — è così che si pianifica commercialmente — ma nel conto economico
// entra alla stessa base del consuntivo, altrimenti «realizzato» e «scostamento»
// confrontano due cose diverse. 1 = nessuna conversione, per chi non la passa.
export function contoEconomico(dati: DatiAnno, livello: Livello, maisonSlug?: string, quotaD2C = 1): PL {
  const molt = moltiplicatore(dati, livello);
  const maisons = maisonSlug ? dati.maisons.filter((m) => m.slug === maisonSlug) : dati.maisons;
  const ids = maisons.map((m) => m.id);

  const tot = maisons.map(totaliMaison);
  const venditeBase = tot.reduce((s, t) => s + t.totale, 0);
  const advBase = tot.reduce((s, t) => s + t.adv, 0);
  const venditeTotali = dati.maisons.reduce((s, m) => s + totaliMaison(m).totale, 0);

  const fissi = sommaCosti(dati, "FISSO_MENSILE", ids) * 12 + sommaCosti(dati, "FISSO_ANNUO", ids);

  // Nel P&L di una singola maison i costi comuni (struttura, personale non
  // attribuito, premi) si ripartiscono in proporzione ai ricavi.
  const quota = maisonSlug && venditeTotali > 0 ? venditeBase / venditeTotali : 1;

  // Ricavi e costo del venduto per tipologia: ogni servizio ha il suo margine,
  // quindi il COGS complessivo dipende dal mix di vendita, non da un'unica %.
  const ricaviPerServizio: Record<string, number> = {};
  for (const t of tot) {
    for (const [slug, v] of Object.entries(t.perServizio)) {
      const conversione = slug === SLUG_D2C ? quotaD2C : 1;
      ricaviPerServizio[slug] = (ricaviPerServizio[slug] ?? 0) + v * molt * conversione;
    }
  }
  // Si risomma dalle tipologie invece di usare `venditeBase`: con la quota
  // applicata al D2C i due numeri non coincidono più.
  const ricavi = Object.values(ricaviPerServizio).reduce((s, v) => s + v, 0);
  const cogs = Object.entries(ricaviPerServizio).reduce(
    (s, [slug, v]) => s + v * (1 - margineDi(dati, slug) / 100),
    0
  );
  const cogsPct = ricavi > 0 ? (cogs / ricavi) * 100 : 0;
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
    ricaviPerServizio,
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
export function contoEconomicoMensile(dati: DatiAnno, livello: Livello, quotaD2C = 1): PLMese[] {
  const molt = moltiplicatore(dati, livello);
  const fissiMese = sommaCosti(dati, "FISSO_MENSILE") + sommaCosti(dati, "FISSO_ANNUO") / 12;

  const righe: PLMese[] = [];
  for (let month = 1; month <= 12; month++) {
    // Il mix di vendita cambia da mese a mese, quindi anche il COGS del mese
    // va ricalcolato tipologia per tipologia.
    let ricavi = 0;
    let cogs = 0;
    for (const m of dati.maisons) {
      const x = m.mesi.find((y) => y.month === month);
      if (!x) continue;
      for (const [slug, v] of Object.entries(x.vendite)) {
        const r = v * molt * (slug === SLUG_D2C ? quotaD2C : 1);
        ricavi += r;
        cogs += r * (1 - margineDi(dati, slug) / 100);
      }
    }
    const adv =
      dati.maisons.reduce((s, m) => {
        const x = m.mesi.find((y) => y.month === month);
        return s + (x ? advConsentitoMese(x, budgetAdvAnno(m)) : 0);
      }, 0) * molt;
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
