// CFO — riclassificazione degli addebiti bancari in categorie di costo.
// Le categorie e le regole vivono a DB (CategoriaCosto, RegolaCosto); questo
// modulo applica le regole alle controparti che arrivano da Finance e
// ricostruisce i costi per categoria e per mese.
import { prisma } from "./db";
import type { SpesaControparte } from "./finance";

// La chiave resta `COGS` (è a DB su CategoriaCosto.tipoPL, rinominarla
// significherebbe migrare le categorie già create), ma **l'etichetta no**: sul
// canale ecommerce non esiste più un «costo del venduto», perché la quota del
// partner è già tolta a monte, nel passaggio da venduto a fatturato. Quello che
// resta qui è il costo dei **servizi** — in primis quanto si paga ai valet per
// la consegna. Attenzione a cosa ci si mette dentro: i pagamenti ai partner in
// questa categoria conterebbero due volte.
export const TIPI_PL = [
  { key: "COGS", label: "Costo per servizi (valet)", badge: "orange" },
  { key: "ADV", label: "Pubblicità", badge: "blue" },
  { key: "PERSONALE", label: "Personale", badge: "purple" },
  { key: "STRUTTURA", label: "Struttura", badge: "neutral" },
  { key: "ESCLUSA", label: "Esclusa dal P&L", badge: "gold" },
] as const;

// ---- La seconda lente: dove va la categoria nel bilancio civilistico ----
//
// `tipoPL` risponde a «quanto margine faccio»: raggruppa per natura gestionale
// (costo per servizi, pubblicità, personale, struttura). Il **bilancio** fa
// un'altra domanda, e le risposte non coincidono — lo si è visto leggendo il
// bilancio 2024 di Deluxy:
//  - la pubblicità (82.802 €) non è una voce a sé: sta dentro B7 «servizi»;
//  - B9 «personale» è **solo** lavoro dipendente (36.725 €), mentre compenso
//    dell'amministratore, co.co.co. e prestazioni occasionali — 42.625 €, più
//    del lavoro dipendente — stanno anche loro in B7;
//  - «struttura» in bilancio si divide fra B7, B8 e B14.
// Per questo la voce di bilancio è un campo suo, impostabile per categoria: chi
// tiene il conto economico non deve rifare a mano la stessa riclassificazione
// ogni anno.
export const VOCI_CE = [
  { key: "B6", label: "B6 · Materie prime e merci", aiuto: "Fiori, torte, prodotti comprati per essere rivenduti." },
  { key: "B7", label: "B7 · Servizi", aiuto: "Valet, partner che eseguono, pubblicità, consulenze, piattaforme, compensi non dipendenti." },
  { key: "B8", label: "B8 · Godimento beni di terzi", aiuto: "Affitti, noleggi, leasing, spese condominiali." },
  { key: "B9", label: "B9 · Personale", aiuto: "Solo lavoro DIPENDENTE: salari, oneri sociali, TFR." },
  { key: "B14", label: "B14 · Oneri diversi di gestione", aiuto: "Imposte non sul reddito, multe, sopravvenienze passive, arrotondamenti." },
  { key: "C17", label: "C17 · Oneri finanziari", aiuto: "Interessi passivi, commissioni bancarie, oneri sui finanziamenti." },
  { key: "ESCLUSA", label: "fuori dal conto economico", aiuto: "Non sono costi: giroconti, IVA, versamenti d'imposta." },
] as const;

// Se nessuno l'ha ancora scelta, si deduce dal tipo gestionale. È un punto di
// partenza ragionevole, non la verità: «Fornitori fiori e torte» per esempio
// nasce su B7 ma in bilancio è **B6** (merce), e va spostata a mano una volta
// sola. La pagina distingue le voci dedotte da quelle decise.
export function voceCEPredefinita(tipoPL: string): string {
  if (tipoPL === "PERSONALE") return "B9";
  if (tipoPL === "ESCLUSA") return "ESCLUSA";
  return "B7";
}

export type Categoria = {
  id: string;
  nome: string;
  tipoPL: string;
  voceCE: string; // sempre valorizzata: se a DB è null, vale la predefinita
  voceCEImpostata: boolean; // false = dedotta, nessuno l'ha ancora confermata
  predefinita: boolean; // raccoglie quello che nessuna regola prende
  colore: string | null;
  ordine: number;
  regole: { id: string; match: string; esatto: boolean }[];
};

export async function caricaCategorie(): Promise<Categoria[]> {
  const cats = await prisma.categoriaCosto.findMany({
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    include: { regole: true },
  });
  return cats.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipoPL: c.tipoPL,
    voceCE: c.voceCE ?? voceCEPredefinita(c.tipoPL),
    voceCEImpostata: Boolean(c.voceCE),
    predefinita: c.predefinita,
    colore: c.colore,
    ordine: c.ordine,
    regole: c.regole.map((r) => ({ id: r.id, match: r.match, esatto: r.esatto })),
  }));
}

// Trova la categoria di una controparte. Vince la regola col match più lungo
// (più specifico); a parità, l'uguaglianza batte il "contiene". Se non matcha
// niente e c'è una categoria **predefinita**, ci finisce lì: meglio una riga
// dichiarata che raccoglie il residuo, che milleduecento controparti fuori da
// ogni voce di conto economico.
export function categoriaDi(controparte: string, categorie: Categoria[]): Categoria | null {
  const c = controparte.toLowerCase();
  let migliore: { cat: Categoria; peso: number } | null = null;
  for (const cat of categorie) {
    for (const r of cat.regole) {
      const m = r.match.trim().toLowerCase();
      if (!m) continue;
      const ok = r.esatto ? c === m : c.includes(m);
      if (!ok) continue;
      const peso = m.length + (r.esatto ? 1000 : 0);
      if (!migliore || peso > migliore.peso) migliore = { cat, peso };
    }
  }
  return migliore?.cat ?? categorie.find((x) => x.predefinita) ?? null;
}

export type RigaCategoria = {
  categoria: Categoria | null; // null = non categorizzata
  uscite: number;
  movimenti: number;
  perMese: number[];
  // `perMese` anche sulla singola controparte: serve a decidere l'anno di
  // competenza direttamente da qui, dove si guardano le uscite — spostare un
  // importo vuol dire sapere in quale mese sta.
  controparti: { controparte: string; uscite: number; perMese: number[] }[];
};

// Raggruppa gli addebiti per categoria applicando le regole.
export function ricostruisci(controparti: SpesaControparte[], categorie: Categoria[]): RigaCategoria[] {
  const perCat = new Map<string, RigaCategoria>();
  const chiave = (c: Categoria | null) => c?.id ?? "__none__";

  for (const s of controparti) {
    const cat = categoriaDi(s.controparte, categorie);
    const k = chiave(cat);
    const r: RigaCategoria =
      perCat.get(k) ??
      { categoria: cat, uscite: 0, movimenti: 0, perMese: Array(12).fill(0), controparti: [] };
    r.uscite += s.uscite;
    r.movimenti += s.movimenti;
    for (let i = 0; i < 12; i++) r.perMese[i] += s.perMese[i] ?? 0;
    r.controparti.push({ controparte: s.controparte, uscite: s.uscite, perMese: s.perMese });
    perCat.set(k, r);
  }

  // controparti dalla più costosa; categorie per ordine configurato, non
  // categorizzate in fondo
  for (const r of perCat.values()) r.controparti.sort((a, b) => b.uscite - a.uscite);
  return [...perCat.values()].sort((a, b) => {
    if (!a.categoria) return 1;
    if (!b.categoria) return -1;
    return a.categoria.ordine - b.categoria.ordine || b.uscite - a.uscite;
  });
}
