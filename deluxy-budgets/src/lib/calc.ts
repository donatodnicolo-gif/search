// Motore di calcolo: scenari su 3 livelli, costo del personale e P&L.
// Tutto ciò che è derivato (livelli sfidante/irraggiungibile, margini,
// risultato operativo, ADV consentito, costo azienda delle persone) si calcola
// qui a partire dai dati salvati a DB — mai memorizzato a mano.
import { prisma } from "./db";
import { caricaVenduto } from "./venduto";
import { primoMeseAperto } from "./periodo";

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

export * from "./persone";
import { costoPersonaAnno, costoPersonaMese, type Persona } from "./persone";


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
  // % per mese (1..12): quanta parte del budget ADV del mese va qui.
  // La ripartizione **dell azienda**, cioe quella predefinita.
  split: Record<number, number>;
  // Le ripartizioni scritte per un singolo brand: id della maison -> mese -> %.
  // Un brand che non ce l ha usa quella dell azienda, e la pagina lo dichiara.
  splitPerBrand: Record<string, Record<number, number>>;
};

export type MaisonBudget = {
  id: string;
  slug: string;
  nome: string;
  ordine: number;
  // Il ROS obiettivo scelto per questo brand; null = usa il predefinito.
  rosObiettivo: number | null;
  // `false` = il brand non fa pubblicita: monte zero, e le sue quote non
  // contano piu niente.
  faPubblicita: boolean;
  mesi: MeseMaison[];
  // Il venduto **vero** dei negozi, mese per mese (null se Orders non risponde
  // o se il brand un negozio non ce l ha). Sta qui, dentro i dati dell anno,
  // perche serve al **calcolo** e non solo a una pagina: il monte pubblicitario
  // si stima su «consuntivo dove c e + budget sul resto», e se quel dato lo
  // avesse solo la schermata dove si scrive, il P&L e /piattaforme userebbero un
  // altro numero.
  vendutoMesi: number[] | null;
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
    return {
      id: m.id, slug: m.slug, nome: m.nome, ordine: m.ordine,
      rosObiettivo: m.rosObiettivo, faPubblicita: m.faPubblicita, mesi, vendutoMesi: null,
    };
  });

  // Il venduto vero dei negozi, attaccato ai dati dell anno. **Best effort**: se
  // Orders non risponde si resta con null e tutto ricade sul budget, che e il
  // comportamento di prima — una pagina che non carica perche il registro ordini
  // e lento sarebbe un guaio peggiore del dato mancante.
  try {
    const vend = await caricaVenduto(year, out);
    if (vend.ok) for (const m of out) m.vendutoMesi = vend.perMaison.get(m.slug) ?? null;
  } catch {
    // si resta sul budget: lo dichiarano le pagine
  }

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
        s[m] = split.find((x) => x.piattaformaId === p.id && x.month === m && x.ambito === "")?.percent ?? 0;
      }
      // Le ripartizioni per brand, raccolte per ambito.
      const perBrand: Record<string, Record<number, number>> = {};
      for (const x of split) {
        if (x.piattaformaId !== p.id || x.ambito === "") continue;
        (perBrand[x.ambito] ??= {})[x.month] = x.percent;
      }
      return {
        id: p.id, nome: p.nome, colore: p.colore, ordine: p.ordine, note: p.note,
        split: s, splitPerBrand: perBrand,
      };
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
// Il ROS obiettivo **si imposta per brand** (richiesta dell utente, 23/08/2026)
// e vive a database su `Maison.rosObiettivo`. Qui resta solo il valore di
// ripiego per chi non ne ha uno suo: un brand nuovo nasce con questo, e la
// pagina dice che e il predefinito invece di far credere che qualcuno l abbia
// scelto.
export const ROS_OBIETTIVO_PREDEFINITO = 6.5;

export function rosDi(m: { rosObiettivo: number | null }): number {
  const r = m.rosObiettivo;
  return r !== null && r > 0 ? r : ROS_OBIETTIVO_PREDEFINITO;
}

// Le vendite dell anno su cui si stima: **consuntivo dove c e, budget sul
// resto** (regola dell utente, 23/08/2026: «nel calcolo devi sommare il budget
// a consuntivo»). E la stessa riga «Attuale» di /maison, e per la stessa
// ragione: su un mese gia chiuso la previsione e stata smentita dai fatti, e
// dimensionare la pubblicita di tutto l anno su una previsione sbagliata
// sbaglia due volte. Sul mese in corso vale il **maggiore** fra il venduto di
// adesso e il budget — non e una proiezione, il mese non puo chiudere sotto
// quello che ha gia venduto.
//
// ⚠️ Il venduto si usa **solo dove e sopra lo zero**: e il venduto dei negozi,
// quindi copre il D2C e non eventi o B2B. Senza questo, «Deluxy Business» — che
// sui negozi non vende niente — si vedrebbe azzerare i mesi chiusi.
export function venditeAnnoAttuale(m: MaisonBudget, year = ANNO_CORRENTE): number {
  const aperto = primoMeseAperto(year);
  return m.mesi.reduce((s, x) => {
    const budget = venditeMese(x);
    const vero = m.vendutoMesi?.[x.month - 1] ?? 0;
    if (vero <= 0) return s + budget;
    if (x.month < aperto) return s + vero;
    if (x.month === aperto) return s + Math.max(vero, budget);
    return s + budget;
  }, 0);
}

// ⚠️ Un brand che **non fa pubblicita** vale zero, e si ferma qui: non basta
// azzerargli le quote. Le quote sono percentuali di questo monte, e finche il
// monte esiste il P&L puo attribuirgliene una parte — e' esattamente quello
// che succedeva a B2B ed Experience, che con quote al 218,4% e 240% si
// prendevano 83.908 EUR di pubblicita che nessuno ha mai comprato.
export function budgetAdvAnno(m: MaisonBudget, year = ANNO_CORRENTE): number {
  if (!m.faPubblicita) return 0;
  const ros = rosDi(m);
  if (ros <= 0) return 0;
  return venditeAnnoAttuale(m, year) / ros;
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
