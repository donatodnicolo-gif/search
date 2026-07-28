import { prisma } from "./db";

// L'andamento delle vendite Shopify, mese per mese, e dove stanno andando.
//
// ⚠️ **Perché non una retta.** Deluxy vende fiori, torte e regali: San
// Valentino, la Festa della mamma e Natale non sono rumore intorno a una
// tendenza, sono la tendenza. Tirare una riga sugli ultimi mesi produrrebbe un
// dicembre da 20.000 € e un febbraio da 15.000 € quando la realtà è il doppio,
// o il contrario. La stagione va tenuta, non spianata.
//
// **Come si proietta, allora.** Il mese di quest'anno si stima come *lo stesso
// mese dell'anno scorso × quanto stiamo andando meglio o peggio quest'anno*.
// La stagione la porta l'anno scorso, la crescita la portano i mesi già chiusi:
//
//     proiezione(mese) = venduto(stesso mese anno scorso) × fattore
//     fattore = somma dei mesi CHIUSI di quest'anno ÷ stessi mesi dell'anno scorso
//
// Il mese in corso non entra nel fattore: è mezzo mese, e mezzo mese confrontato
// con un mese intero direbbe che stiamo crollando.
//
// **Quando l'anno prima non c'è.** Cake ha aperto a metà 2025: da gennaio a
// giugno 2025 ha 2-7 ordini al mese, e su quelli non si misura nessuna
// crescita. Lì si ripiega su un secondo metodo, dichiarato: la **media dei
// mesi chiusi recenti**, tenuta piatta. È peggiore — non ha la stagione — ma
// dire "5.200 € al mese, senza stagione" è più utile di una casella vuota, a
// patto che sia scritto che la stagione non c'è.
//
// **Quando non si proietta comunque niente.** Un mese con pochi ordini l'anno
// scorso non è una base: si dichiara e si lascia vuoto, invece di stampare un
// numero che sembra un dato.

// Sotto questa soglia il mese dell'anno prima non fa da base: erano quattro
// ordini, moltiplicarli non produce una previsione, produce un rumore ×
// fattore.
const ORDINI_MINIMI_BASE = 10;

// Ordini che non sono vendite: la stessa esclusione del resto dell'app.
const STATI_NON_VENDUTI = ["annullato", "rimborsato"];

export type MeseVendite = {
  anno: number;
  mese: number; // 1-12
  vendite: number;
  ordini: number;
  // "storico" = è successo · "corrente" = mese in corso, parziale · "proiezione"
  tipo: "storico" | "corrente" | "proiezione";
  // Solo per le proiezioni: da quale mese nasce, e quanti ordini aveva
  base?: { anno: number; vendite: number; ordini: number };
};

export type TrendVendite = {
  mesi: MeseVendite[];
  // Con quale dei due metodi si è proiettato (vedi in testa al file).
  metodo: "anno_su_anno" | "livello_recente" | "nessuno";
  // Solo per "livello_recente": la media mensile usata come piano.
  livelloRecente: number | null;
  fattore: number | null;
  // I mesi chiusi usati per calcolare il fattore (quest'anno vs anno prima)
  mesiConfronto: number;
  quest_anno: number;
  anno_prima: number;
  annoCorrente: number;
  meseCorrente: number;
  avvertenze: string[];
  // Il totale dell'anno come si prospetta: chiuso + mese in corso stimato
  // INTERO + proiezioni
  totaleAnnoStimato: number | null;
  totaleAnnoScorso: number | null;
  // Il mese in corso stimato per intero (null se l'anno prima non fa da base)
  stimaMeseCorrente: number | null;
};

export async function trendVendite(opzioni: { brand?: string; mesiAvanti?: number } = {}): Promise<TrendVendite> {
  const mesiAvanti = Math.min(Math.max(opzioni.mesiAvanti ?? 6, 1), 12);
  const oggi = new Date();
  const annoCorrente = oggi.getFullYear();
  const meseCorrente = oggi.getMonth() + 1;

  // Una lettura sola di tutto lo storico e il raggruppamento in memoria: sono
  // poche migliaia di righe con tre campi, e una query per mese sarebbe
  // ventiquattro andate e ritorno per disegnare un grafico.
  const ordini = await prisma.ordine.findMany({
    where: {
      stato: { notIn: STATI_NON_VENDUTI },
      ...(opzioni.brand ? { brand: opzioni.brand } : {}),
    },
    select: { data: true, totale: true },
  });

  const per = new Map<string, { vendite: number; ordini: number }>();
  for (const o of ordini) {
    const chiave = `${o.data.getFullYear()}-${o.data.getMonth() + 1}`;
    const voce = per.get(chiave) ?? { vendite: 0, ordini: 0 };
    voce.vendite += o.totale ?? 0;
    voce.ordini += 1;
    per.set(chiave, voce);
  }
  const leggi = (anno: number, mese: number) => per.get(`${anno}-${mese}`) ?? { vendite: 0, ordini: 0 };

  const avvertenze: string[] = [];

  // ——— Il fattore: quanto stiamo andando meglio (o peggio) dell'anno scorso ———
  // Solo sui mesi CHIUSI, e solo su quelli che l'anno scorso avevano davvero
  // dei numeri: un gennaio 2025 a zero perché il registro partiva a metà mese
  // farebbe risultare una crescita inventata.
  let quest_anno = 0;
  let anno_prima = 0;
  let mesiConfronto = 0;
  for (let m = 1; m < meseCorrente; m++) {
    const prima = leggi(annoCorrente - 1, m);
    if (prima.ordini < ORDINI_MINIMI_BASE) continue;
    quest_anno += leggi(annoCorrente, m).vendite;
    anno_prima += prima.vendite;
    mesiConfronto++;
  }
  const fattore = anno_prima > 0 && mesiConfronto >= 2 ? quest_anno / anno_prima : null;

  // ——— Ripiego: il livello dei mesi chiusi recenti, senza stagione ———
  // Serve quando l'anno prima non esiste abbastanza da misurare una crescita
  // (tipico di un negozio aperto da poco).
  let livelloRecente: number | null = null;
  if (fattore == null) {
    const chiusi: number[] = [];
    let anno = annoCorrente;
    let mese = meseCorrente;
    for (let i = 0; i < 3; i++) {
      mese--;
      if (mese < 1) {
        mese = 12;
        anno--;
      }
      const v = leggi(anno, mese);
      if (v.ordini >= ORDINI_MINIMI_BASE) chiusi.push(v.vendite);
    }
    if (chiusi.length >= 2) livelloRecente = chiusi.reduce((s, v) => s + v, 0) / chiusi.length;
  }
  const metodo: TrendVendite["metodo"] =
    fattore != null ? "anno_su_anno" : livelloRecente != null ? "livello_recente" : "nessuno";

  if (fattore == null) {
    avvertenze.push(
      mesiConfronto < 2
        ? `Non si può misurare la crescita sul ${annoCorrente - 1}: solo ${mesiConfronto} mesi chiusi hanno abbastanza storico a cui confrontarsi (serve almeno ${ORDINI_MINIMI_BASE} ordini nello stesso mese dell'anno prima). Succede quando il negozio ha aperto da poco.`
        : `Il ${annoCorrente - 1} non ha vendite confrontabili: non c'è una crescita da misurare.`
    );
    if (livelloRecente != null) {
      avvertenze.push(
        `Si proietta col ripiego: la media dei mesi chiusi recenti, tenuta piatta. ⚠️ Questa previsione NON ha la stagione dentro — dicembre e febbraio saranno più alti di così, agosto più basso.`
      );
    } else {
      avvertenze.push("Nemmeno i mesi chiusi recenti hanno abbastanza ordini: non si proietta niente.");
    }
  }

  // ——— La serie: storico, mese in corso, proiezioni ———
  const mesi: MeseVendite[] = [];

  // Storico: dal primo mese con ordini fino al mese scorso.
  const primo = ordini.reduce<Date | null>((min, o) => (min == null || o.data < min ? o.data : min), null);
  if (primo) {
    let anno = primo.getFullYear();
    let mese = primo.getMonth() + 1;
    while (anno < annoCorrente || (anno === annoCorrente && mese <= meseCorrente)) {
      const v = leggi(anno, mese);
      mesi.push({
        anno,
        mese,
        vendite: v.vendite,
        ordini: v.ordini,
        tipo: anno === annoCorrente && mese === meseCorrente ? "corrente" : "storico",
      });
      mese++;
      if (mese > 12) {
        mese = 1;
        anno++;
      }
    }
  }

  // Proiezioni: i prossimi mesi, a partire dal prossimo.
  let senzaBase = 0;
  if (metodo !== "nessuno") {
    let anno = annoCorrente;
    let mese = meseCorrente;
    for (let i = 0; i < mesiAvanti; i++) {
      mese++;
      if (mese > 12) {
        mese = 1;
        anno++;
      }
      if (fattore != null) {
        const base = leggi(anno - 1, mese);
        if (base.ordini < ORDINI_MINIMI_BASE) {
          senzaBase++;
          continue; // niente stagione da riusare: si lascia vuoto, non si inventa
        }
        mesi.push({
          anno,
          mese,
          vendite: base.vendite * fattore,
          ordini: Math.round(base.ordini * fattore),
          tipo: "proiezione",
          base: { anno: anno - 1, vendite: base.vendite, ordini: base.ordini },
        });
      } else if (livelloRecente != null) {
        // Piatto, e la pagina lo dice: nessuna stagione dentro.
        mesi.push({ anno, mese, vendite: livelloRecente, ordini: 0, tipo: "proiezione" });
      }
    }
    if (senzaBase > 0) {
      avvertenze.push(
        `${senzaBase} dei prossimi ${mesiAvanti} mesi non si proiettano: l'anno prima avevano meno di ${ORDINI_MINIMI_BASE} ordini, e moltiplicare quattro ordini non fa una previsione.`
      );
    }
  }

  // Il mese in corso è parziale per costruzione: va detto, o sembra un crollo.
  const corrente = mesi.find((m) => m.tipo === "corrente");
  if (corrente) {
    const giorno = oggi.getDate();
    const giorniMese = new Date(annoCorrente, meseCorrente, 0).getDate();
    avvertenze.push(
      `Il mese in corso è fermo al giorno ${giorno} di ${giorniMese}: la sua barra è più bassa non perché si venda meno, ma perché il mese non è finito.`
    );
  }

  // ——— Come si chiude l'anno, se le proiezioni tengono ———
  // Attenzione al mese in corso: nel totale d'anno va contato **intero**, non
  // per i giorni già passati, altrimenti l'anno risulta più corto di quello che
  // è. Se l'anno prima quel mese ha una base, si usa quella per stimarlo tutto.
  const baseCorrente = leggi(annoCorrente - 1, meseCorrente);
  const stimaMeseCorrente =
    fattore != null && baseCorrente.ordini >= ORDINI_MINIMI_BASE
      ? baseCorrente.vendite * fattore
      : livelloRecente;
  const diQuestAnno = mesi.filter((m) => m.anno === annoCorrente);
  const totaleAnnoStimato =
    metodo !== "nessuno"
      ? diQuestAnno.reduce(
          (s, m) => s + (m.tipo === "corrente" ? (stimaMeseCorrente ?? m.vendite) : m.vendite),
          0
        )
      : null;
  const totaleAnnoScorso = Array.from({ length: 12 }, (_, i) => leggi(annoCorrente - 1, i + 1).vendite).reduce(
    (s, v) => s + v,
    0
  );

  return {
    mesi,
    metodo,
    livelloRecente,
    fattore,
    mesiConfronto,
    quest_anno,
    anno_prima,
    annoCorrente,
    meseCorrente,
    avvertenze,
    totaleAnnoStimato,
    totaleAnnoScorso: totaleAnnoScorso > 0 ? totaleAnnoScorso : null,
    stimaMeseCorrente,
  };
}
