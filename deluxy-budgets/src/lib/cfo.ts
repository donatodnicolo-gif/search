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
// Le etichette rispondono alla domanda che si sta facendo chi sceglie — «questa
// spesa che effetto ha sul margine?» — invece di nominare la casella. `aiuto` è
// la riga che si legge sotto: dice quando scegliere quella voce **e quando no**,
// perché gli errori veri stanno sui confini (un fioraio pagato per un ordine
// ecommerce non è un costo, è denaro che non era nostro).
export const TIPI_PL = [
  {
    key: "COGS",
    label: "Costo del servizio",
    badge: "orange",
    aiuto: "Quello che si paga per eseguire un ordine: valet, corrieri, fornitori di eventi. Cresce con le vendite. NON metterci i partner dell'ecommerce: quelli sono partita di giro.",
  },
  {
    key: "ADV",
    label: "Pubblicità",
    badge: "blue",
    aiuto: "Solo le piattaforme che vendono spazi: Google Ads, Meta, TikTok, email marketing. Non gli strumenti che si usano per farla.",
  },
  {
    key: "PERSONALE",
    label: "Persone",
    badge: "purple",
    aiuto: "Stipendi, contributi, compensi di amministratore e collaboratori. Attenzione: nel bilancio civilistico solo i dipendenti stanno in B9, il resto va in B7.",
  },
  {
    key: "STRUTTURA",
    label: "Struttura",
    badge: "neutral",
    aiuto: "Quello che si paga comunque, vendendo o no: affitti, software, commercialista, auto, trasferte. È il costo fisso.",
  },
  {
    key: "ESCLUSA",
    label: "Fuori dal conto economico",
    badge: "gold",
    aiuto: "Denaro che esce ma non è un costo: quota dei partner sull'ecommerce, giroconti fra conti propri, IVA e imposte, rimborsi di ordini già tolti dai ricavi.",
  },
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
// La stessa spesa, vista dal bilancio. Le etichette portano il codice **e** le
// parole di tutti i giorni, perché chi sceglie qui non ha il codice civile
// davanti: sa che ha comprato dei fiori, non che sta compilando un B6.
export const VOCI_CE = [
  { key: "B6", label: "B6 · Roba comprata (merci e materiali)", aiuto: "Quello che si compra per rivenderlo o consumarlo: fiori, torte, confezioni, carburante." },
  { key: "B7", label: "B7 · Servizi di qualcun altro", aiuto: "Chi lavora per noi senza essere dipendente: valet, corrieri, consulenti, agenzie, piattaforme, e anche la pubblicità e il compenso dell'amministratore." },
  { key: "B8", label: "B8 · Cose usate ma non nostre", aiuto: "Affitti, noleggi, leasing, spese condominiali: si paga per usare, non per possedere." },
  { key: "B9", label: "B9 · Dipendenti", aiuto: "SOLO chi ha una busta paga: stipendi, contributi, TFR. Amministratore e collaboratori vanno in B7, anche se nell'app stanno fra le «persone»." },
  { key: "B14", label: "B14 · Il resto che costa", aiuto: "Tributi che non sono sul reddito (bolli, tasse locali), multe, arrotondamenti, sopravvenienze passive." },
  { key: "C17", label: "C17 · Costo del denaro", aiuto: "Interessi, commissioni bancarie, canoni del conto, oneri sui finanziamenti." },
  { key: "IMPOSTE", label: "Imposte sul reddito (IRES, IRAP)", aiuto: "Quello che si versa all'Agenzia delle Entrate sul reddito. Sta sotto l'EBITDA: nel P&L gestionale resta fuori, in bilancio no." },
  { key: "ESCLUSA", label: "Non entra in bilancio", aiuto: "Non è un costo dell'esercizio: giroconti fra conti propri, IVA che si versa e si recupera, quota dei partner sull'ecommerce, rimborsi di ordini già tolti dai ricavi." },
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
  // Cosa ci va dentro e cosa no, con le parole dell'azienda. Il nome dice
  // *come si chiama*, questa dice *quando sceglierla*: senza, chi assegna una
  // controparte indovina, e la stessa spesa finisce oggi in una categoria e
  // domani in un'altra.
  descrizione: string | null;
  tipoPL: string;
  voceCE: string; // sempre valorizzata: se a DB è null, vale la predefinita
  voceCEImpostata: boolean; // false = dedotta, nessuno l'ha ancora confermata
  predefinita: boolean; // raccoglie quello che nessuna regola prende
  quotaPartner: boolean; // partita di giro sulle vendite ecommerce (modello C)
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
    descrizione: c.descrizione,
    tipoPL: c.tipoPL,
    voceCE: c.voceCE ?? voceCEPredefinita(c.tipoPL),
    voceCEImpostata: Boolean(c.voceCE),
    predefinita: c.predefinita,
    quotaPartner: c.quotaPartner,
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
  return abbina(controparte, categorie).categoria;
}

// La stessa cosa, ma dicendo **come** ci è arrivata. Serve perché da quando una
// categoria «raccoglie il residuo» le due cose si confondono: chi guarda una
// voce di bilancio vede un importo unico, e non sa che dentro ci sono
// controparti che nessuno ha mai classificato — sono lì solo perché dovevano
// stare da qualche parte. Un totale che non distingue le due cose fa credere
// che il lavoro sia finito.
export function abbina(
  controparte: string,
  categorie: Categoria[]
): { categoria: Categoria | null; daRegola: boolean } {
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
  if (migliore) return { categoria: migliore.cat, daRegola: true };
  return { categoria: categorie.find((x) => x.predefinita) ?? null, daRegola: false };
}

export type RigaCategoria = {
  categoria: Categoria | null; // null = non categorizzata
  uscite: number;
  movimenti: number;
  perMese: number[];
  // Quanto, di quelle uscite, è arrivato qui **senza** che una regola lo dicesse:
  // è il residuo raccolto dalla categoria predefinita. Su tutte le altre è zero.
  residuo: number;
  // `perMese` anche sulla singola controparte: serve a decidere l'anno di
  // competenza direttamente da qui, dove si guardano le uscite — spostare un
  // importo vuol dire sapere in quale mese sta.
  controparti: { controparte: string; uscite: number; perMese: number[]; daRegola: boolean }[];
};

// Raggruppa gli addebiti per categoria applicando le regole.
export function ricostruisci(controparti: SpesaControparte[], categorie: Categoria[]): RigaCategoria[] {
  const perCat = new Map<string, RigaCategoria>();
  const chiave = (c: Categoria | null) => c?.id ?? "__none__";

  for (const s of controparti) {
    const { categoria: cat, daRegola } = abbina(s.controparte, categorie);
    const k = chiave(cat);
    const r: RigaCategoria =
      perCat.get(k) ??
      { categoria: cat, uscite: 0, movimenti: 0, perMese: Array(12).fill(0), residuo: 0, controparti: [] };
    r.uscite += s.uscite;
    r.movimenti += s.movimenti;
    if (!daRegola) r.residuo += s.uscite;
    for (let i = 0; i < 12; i++) r.perMese[i] += s.perMese[i] ?? 0;
    r.controparti.push({ controparte: s.controparte, uscite: s.uscite, perMese: s.perMese, daRegola });
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
