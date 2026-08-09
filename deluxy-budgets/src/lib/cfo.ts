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
  { key: "B6", label: "B6 · Merci e materiali comprati", aiuto: "Quello che si compra per rivenderlo o consumarlo: fiori, torte, confezioni, carburante." },
  { key: "B7", label: "B7 · Servizi comprati da fuori", aiuto: "Tutto quello che qualcun altro fa PER NOI senza essere dipendente: valet, corrieri, consulenti, agenzie, piattaforme, pubblicità e compenso dell'amministratore. È la voce più grande del bilancio." },
  { key: "B8", label: "B8 · Affitti e noleggi", aiuto: "Affitti, noleggi, leasing, spese condominiali: si paga per usare, non per possedere." },
  { key: "B9", label: "B9 · Dipendenti", aiuto: "SOLO chi ha una busta paga: stipendi, contributi, TFR. Amministratore e collaboratori vanno in B7, anche se nell'app stanno fra le «persone»." },
  { key: "B14", label: "B14 · Altri costi (tributi, multe)", aiuto: "Tributi che non sono sul reddito (bolli, tasse locali), multe, arrotondamenti, sopravvenienze passive." },
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
// Il nome come si confronta: minuscolo, senza spazi ai bordi, spazi ripetuti
// schiacciati. Due dettagli invisibili che valgono soldi veri:
//
//  - lo **spazio non separabile** (U+00A0) si scrive come un normale spazio ma
//    non lo è: `"Lo Proto" !== "Lo Proto"`, quindi una regola a match
//    esatto incollata da una pagina web non scatta **mai**;
//  - il letterale **`&nbsp;`**, cioè HTML finito dentro il campo copiando da un
//    browser.
//
// Misurato il 31/07/2026: **67 regole su 2.500** avevano uno dei due dentro ed
// erano morte senza che niente lo dicesse. Una di queste è la regola esatta che
// nomina `Giada Maria Francesca Lo Proto` come **dipendente**: non scattando,
// vinceva la regola generica `lo proto` e quegli 8.194 € finivano fra le quote
// dei partner, cioè fuori dal conto economico invece che nel costo del
// personale. Stessa normalizzazione in Finance (`categoriaDaRegole`), che deve
// dare lo stesso risultato su tutto.
export const normalizzaNomeRegola = (s: string) =>
  s
    .replace(/&nbsp;/gi, " ")
    // zero-width: si incollano senza vedersi e spezzano il confronto
    .replace(/[​-‍﻿]/g, "")
    // `\s` copre anche lo spazio non separabile U+00A0
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function abbina(
  controparte: string,
  categorie: Categoria[]
): { categoria: Categoria | null; daRegola: boolean } {
  const c = normalizzaNomeRegola(controparte);
  let migliore: { cat: Categoria; peso: number } | null = null;
  for (const cat of categorie) {
    for (const r of cat.regole) {
      const m = normalizzaNomeRegola(r.match);
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

// Raggruppa gli addebiti per categoria.
//
// ⭐ **CHI CLASSIFICA È FINANCE** (31/07/2026, decisione dell'utente: «Finance
// importa le regole di Budgets e poi sarà Finance a classificarle, anche con
// l'uso dell'AI»). Prima questa funzione **ricalcolava tutto** dalle regole e
// buttava via la categoria che Finance le mandava già dentro `/api/spese`: due
// calcoli sulla stessa spesa, e una categoria cambiata a mano — o dall'AI — in
// Finance che non arrivava mai al conto economico. Adesso:
//
//  1. se Finance ha classificato quella controparte, **vale quella**, divisa per
//     categoria con i suoi importi (una controparte può aver pagato cose di
//     natura diversa, e va spezzata invece di finire tutta nella prima);
//  2. solo dove Finance non ha ancora niente si applicano le **regole** di
//     Budgets, che restano scritte qui e da qui Finance le importa.
//
// Conseguenza da sapere, ed è voluta: la categoria di Finance è una
// **fotografia**, scattata quando si preme «Applica le regole». Scrivendo una
// regola nuova qui, il conto economico **non cambia** finché quella fotografia
// non viene rifatta. Prima era il contrario, e il contrario è quello che faceva
// divergere le due app.
// Sotto mezzo euro è arrotondamento, non una spesa da classificare.
const SOGLIA_SCOPERTO = 0.5;

export function ricostruisci(controparti: SpesaControparte[], categorie: Categoria[]): RigaCategoria[] {
  const perCat = new Map<string, RigaCategoria>();
  const chiave = (c: Categoria | null) => c?.id ?? "__none__";
  const perId = new Map(categorie.map((c) => [c.id, c]));
  const perNome = new Map(categorie.map((c) => [c.nome.toLowerCase(), c]));

  const aggiungi = (
    cat: Categoria | null,
    daRegola: boolean,
    pezzo: { controparte: string; uscite: number; movimenti: number; perMese: number[] }
  ) => {
    const k = chiave(cat);
    const r: RigaCategoria =
      perCat.get(k) ??
      { categoria: cat, uscite: 0, movimenti: 0, perMese: Array(12).fill(0), residuo: 0, controparti: [] };
    r.uscite += pezzo.uscite;
    r.movimenti += pezzo.movimenti;
    if (!daRegola) r.residuo += pezzo.uscite;
    for (let i = 0; i < 12; i++) r.perMese[i] += pezzo.perMese[i] ?? 0;
    r.controparti.push({ controparte: pezzo.controparte, uscite: pezzo.uscite, perMese: pezzo.perMese, daRegola });
    perCat.set(k, r);
  };

  for (const s of controparti) {
    // La categoria di Budgets che corrisponde a quella scritta da Finance:
    // prima per **id** (una rinomina non deve far divergere niente in silenzio),
    // poi per nome, che è tutto quello che c'era prima del 31/07/2026.
    const daFinance = (s.categorie ?? [])
      .map((c) => ({
        cat: (c.id ? perId.get(c.id) : undefined) ?? perNome.get(c.nome.toLowerCase()) ?? null,
        uscite: c.uscite,
        perMese: c.perMese,
      }))
      .filter((x) => x.cat !== null);

    if (daFinance.length === 0) {
      // Finance non ha ancora classificato: valgono le regole di Budgets.
      const { categoria, daRegola } = abbina(s.controparte, categorie);
      aggiungi(categoria, daRegola, {
        controparte: s.controparte,
        uscite: s.uscite,
        movimenti: s.movimenti,
        perMese: s.perMese,
      });
      continue;
    }

    // Senza gli importi per categoria (Finance non ancora aggiornato) si
    // attribuisce tutto alla prima: è quello che succedeva comunque prima.
    const conImporti = daFinance.every((x) => typeof x.uscite === "number");
    if (!conImporti) {
      aggiungi(daFinance[0].cat, true, {
        controparte: s.controparte,
        uscite: s.uscite,
        movimenti: s.movimenti,
        perMese: s.perMese,
      });
      continue;
    }

    // ⚠️ **Una categoria non vuol dire tutti i movimenti** (09/08/2026). Finance
    // classifica **movimento per movimento**, quindi una controparte può averne
    // alcuni riconosciuti e altri no — succede quando il nome grezzo del
    // movimento è scritto in un altro modo (uno spazio davanti, un `SUMUP *`) e
    // la regola non scatta su quella riga. Qui, finché c'era **una sola**
    // categoria, si attribuiva a quella l'intero totale della controparte: i
    // movimenti che nessuna regola aveva riconosciuto entravano nel conto
    // economico come se fossero classificati. Misurato sul 2026 (835.379 € di
    // uscite): **27.260 € assorbiti così** — 20.000 in «Banca e giroconti»,
    // 8.404 fra i partner, 1.652 negli stipendi — e altri **919 €** (PayPal, tre
    // categorie) che sparivano del tutto, perché nel caso a più categorie si
    // sommavano solo i pezzi noti. Il residuo dichiarato era 4.107 € contro
    // 36.272 € di uscite senza classificazione: la copertura al 99,5% era vera
    // solo per le controparti *interamente* scoperte.
    const scopertoPerMese = [...s.perMese];
    let coperto = 0;
    for (const x of daFinance) {
      coperto += x.uscite ?? 0;
      const m = x.perMese ?? [];
      for (let i = 0; i < 12; i++) scopertoPerMese[i] -= m[i] ?? 0;
    }
    const scoperto = s.uscite - coperto;

    // Sul pezzo scoperto valgono le regole di Budgets, come per una controparte
    // che Finance non ha mai visto: è esattamente quello che succederà alla
    // prossima passata di «Riclassifica tutto». Se la regola non c'è, resta
    // residuo e si vede.
    const perPezzo = scoperto > SOGLIA_SCOPERTO ? abbina(s.controparte, categorie) : null;

    // I pezzi si fondono per (categoria, da regola o no): senza, una controparte
    // comparirebbe due volte nella stessa riga del dettaglio.
    const pezzi: { cat: Categoria | null; daRegola: boolean; uscite: number; perMese: number[] }[] = [];
    const unisci = (cat: Categoria | null, daRegola: boolean, uscite: number, perMese: number[]) => {
      const esiste = pezzi.find((p) => (p.cat?.id ?? null) === (cat?.id ?? null) && p.daRegola === daRegola);
      const dest = esiste ?? { cat, daRegola, uscite: 0, perMese: Array(12).fill(0) as number[] };
      dest.uscite += uscite;
      for (let i = 0; i < 12; i++) dest.perMese[i] += perMese[i] ?? 0;
      if (!esiste) pezzi.push(dest);
    };
    for (const x of daFinance) unisci(x.cat, true, x.uscite ?? 0, x.perMese ?? []);
    if (perPezzo) unisci(perPezzo.categoria, perPezzo.daRegola, scoperto, scopertoPerMese);

    for (const p of pezzi) {
      aggiungi(p.cat, p.daRegola, {
        controparte: s.controparte,
        uscite: p.uscite,
        // I movimenti non si sanno per categoria: si contano una volta sola,
        // sul primo pezzo, invece di moltiplicarli per il numero di voci.
        movimenti: p === pezzi[0] ? s.movimenti : 0,
        perMese: p.perMese,
      });
    }
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
