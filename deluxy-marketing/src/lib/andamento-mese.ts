import { prisma } from "@/lib/db";
import { confiniMeseRoma, oggiRoma } from "@/lib/fuso";

// Il foglio SALES del Monitoraggio, calcolato dai dati veri invece che a mano.
//
// Risponde a tre domande, per ogni brand e per il totale:
//   1. quanto abbiamo venduto finora, e a che ritmo;
//   2. dove finiremo a fine mese se il ritmo resta questo;
//   3. la spesa pubblicitaria sta dentro il budget, giorno per giorno.
//
// TRE ONESTÀ CHE NON SI POSSONO SALTARE
// · **Oggi è un giorno a metà, e si conta per quanto è lungo davvero.** Fino al
//   23/08/2026 le medie si facevano sui giorni CONCLUSI (`getDate() - 1`), e
//   oggi restava fuori del tutto: alle 23:49 del 23 la pagina diceva «22 giorni
//   conclusi» e ignorava 15 ordini e 2.123 € che erano già in archivio, mentre
//   la colonna si chiamava «ad oggi». Il difetto vero però era un altro: il
//   divisore era un conto di CALENDARIO, non una misura. Contare oggi come un
//   giorno intero sarebbe stato l'errore opposto — alle 09:00 tre ore di ordini
//   divise come una giornata piena fanno crollare la media e la proiezione, per
//   poi risalire durante il giorno. Quindi il ritmo si divide per il **tempo
//   davvero trascorso** dal primo del mese: stasera il 23 vale ~0,99 giorni,
//   domattina alle 09:00 il 24 varrà ~0,4. La media non si sporca mai, e i
//   totali dicono quello che la colonna promette.
// · **I confini sono in ora di ROMA, non del server.** Vedi `lib/fuso.ts`: su
//   Vercel il runtime è UTC, e la «mezzanotte» del primo del mese cadeva alle
//   02:00 italiane — con ordini veri che finivano fuori dal mese.
// · La stima è una proiezione lineare, non una previsione: non sa nulla di
//   San Valentino, Natale o della settimana di Ferragosto. Va letta come "se
//   il ritmo resta questo", e questo va scritto accanto al numero.

export type RigaMese = {
  brand: string;
  // L'obiettivo di vendita del mese: viene da `BudgetMensile.venditaPrevista`
  // (il piano SALES GLOBAL si è rivelato aspirazionale — vedi il commento in
  // testa a `andamentoMese`). Il nome resta `pianoVendite` perché è quello che
  // la UI già usa; la fonte è cambiata, la domanda a cui risponde no.
  pianoVendite: number | null;
  // Questo invece resta il budget ADV del Monitoraggio.
  pianoBudgetAdv: number | null;
  // Consuntivo dai dati veri
  vendite: number;
  ordini: number;
  spesa: number;
  // Ritmi e proiezioni
  vendtiteAlGiorno: number | null;
  spesaAlGiorno: number | null;
  stimaVendite: number | null;
  stimaSpesa: number | null;
  // Confronti col piano
  quotaPiano: number | null; // stima ÷ piano
  quotaBudget: number | null; // stima spesa ÷ budget
  ritmoPrevistoAdv: number | null; // budget ÷ giorni del mese
  ros: number | null;
  rosPiano: number | null;
};

export type AndamentoMese = {
  anno: number;
  mese: number;
  giorniMese: number;
  /**
   * Il tempo trascorso dal primo del mese, in giorni, con la virgola: è il
   * DIVISORE di ogni media. Frazionario apposta — vedi la prima onestà in
   * cima al file.
   */
  giorniTrascorsi: number;
  /**
   * Il numero da mostrare: in che giorno del mese siamo (23 su 31), non
   * quanti ne sono conclusi. È quello che una persona conta guardando il
   * calendario, ed è quello che la pagina deve dire.
   */
  giorniToccati: number;
  oggiIncluso: boolean;
  righe: RigaMese[];
  totale: RigaMese;
  // Canali che non stanno mandando spesa: senza, il budget sembra rispettato
  canaliMuti: string[];
  // Campagne con giorni mancanti nel mese: la spesa risulta più bassa del vero
  // e il budget sembra rispettato quando non lo è. È un buco d'archivio, non un
  // risparmio, e va detto prima che qualcuno ci prenda una decisione.
  buchi: {
    campagne: number;
    giorniMancanti: number;
    // Chi sono: «2 campagne» senza nomi è un allarme su cui non si può fare
    // niente — bisogna andarsele a cercare a mano una per una.
    quali: { nome: string; giorniMancanti: number; spesaStimata: number }[];
    // Quanto varrebbero quei giorni, e quanto pesano sul mese. Senza, un buco
    // da sei centesimi sembra grave quanto uno da mille euro.
    spesaStimataMancante: number;
    quotaSulMese: number | null;
  } | null;
};

const BRAND_SITO: Record<string, string> = { gifts: "gifts", flowers: "flowers", cake: "cake" };

export async function andamentoMese(anno: number, mese: number): Promise<AndamentoMese> {
  // ⚠️ Mezzanotte ITALIANA, non quella del server: vedi `lib/fuso.ts`.
  const { inizio, fine: inizioProssimo } = confiniMeseRoma(anno, mese);
  // Regge anche i due mesi del cambio d'ora, che durano 30,96 o 31,04 giorni.
  const giorniMese = Math.round((inizioProssimo.getTime() - inizio.getTime()) / 86_400_000);

  const adesso = new Date();
  const oggi = oggiRoma();
  const meseInCorso = oggi.anno === anno && oggi.mese === mese;

  // Il tempo davvero trascorso, con la virgola. Se il mese è passato sono tutti
  // i suoi giorni; se è in corso è la distanza dal primo del mese a ADESSO.
  const giorniTrascorsi = meseInCorso
    ? (adesso.getTime() - inizio.getTime()) / 86_400_000
    : giorniMese;
  // In che giorno del mese siamo: 23 su 31. È il numero che si mostra.
  const giorniToccati = meseInCorso ? Math.min(Math.ceil(giorniTrascorsi), giorniMese) : giorniMese;
  // I giorni CONCLUSI servono ancora, ma per una domanda sola: quante giornate
  // di spesa dovrebbe avere in archivio una campagna. Quella di oggi la manda
  // lo script stanotte, quindi non si può pretenderla.
  const giorniCompleti = Math.floor(giorniTrascorsi);

  // ⚠️ La finestra arriva fino a ORA, non a mezzanotte di stamattina: la
  // colonna si chiama «ad oggi» e adesso lo è davvero.
  const fine = meseInCorso ? adesso : inizioProssimo;

  // ⚠️ L'obiettivo di vendita viene da BudgetMensile, NON da VenditaMensile.
  //
  // Le due tabelle nascono dallo stesso file (il Monitoraggio) ma da fogli
  // diversi, e dicono numeri diversi. `VenditaMensile.vendite` è il piano
  // SALES GLOBAL: per Flowers prevedeva 143.040 € a luglio 2026 contro 31.948 €
  // venduti davvero, e 2,08 MILIONI sull'anno contro 140.252 € fatti in sette
  // mesi — quindici volte la realtà. Non era un errore di import (le quote
  // mensili sommano a 1, il budget ADV è proporzionale): è un piano
  // aspirazionale mai riallineato.
  //
  // `BudgetMensile.venditaPrevista` invece regge il confronto: 30.000 € contro
  // 31.948 € venduti. Un obiettivo che sbaglia di quindici volte non è un
  // obiettivo severo, è un numero che non si può leggere: la barra segna 23% e
  // sembra un disastro quando il mese è andato bene.
  //
  // Il piano resta nel database e nella pagina Vendite: qui non guida più il
  // semaforo. (Deciso con l'utente il 31/07/2026.)
  const [piano, budget, ordini, spese] = await Promise.all([
    prisma.venditaMensile.findMany({ where: { anno, mese } }),
    prisma.budgetMensile.findMany({ where: { anno, mese } }),
    prisma.ordine.groupBy({
      by: ["brand"],
      where: { data: { gte: inizio, lt: fine }, stato: { notIn: ["annullato", "rimborsato"] } },
      _sum: { totale: true },
      _count: { _all: true },
    }),
    prisma.metricaCampagna.findMany({
      where: { data: { gte: inizio, lt: fine } },
      select: { spesa: true, campagna: { select: { brand: true, canale: true } } },
    }),
  ]);

  const spesaBrand = new Map<string, number>();
  const canaliVivi = new Set<string>();
  for (const m of spese) {
    const b = m.campagna.brand;
    spesaBrand.set(b, (spesaBrand.get(b) ?? 0) + (m.spesa ?? 0));
    if ((m.spesa ?? 0) > 0) canaliVivi.add(m.campagna.canale);
  }
  const canaliMuti = ["google_ads", "meta_ads"].filter((c) => !canaliVivi.has(c));

  // Quante giornate ha ciascuna campagna che ha speso nel mese: se qualcuna ne
  // ha meno delle altre, l'archivio ha buchi e i totali sono sottostimati.
  const giorniPerCampagna = await prisma.metricaCampagna.groupBy({
    by: ["campagnaId"],
    where: { data: { gte: inizio, lt: fine } },
    _count: { _all: true },
    _sum: { spesa: true },
  });
  const attesi = Math.max(giorniCompleti, 1);
  const incomplete = giorniPerCampagna.filter((c) => c._count._all < attesi * 0.9);

  // ⚠️ Un buco vale quanto la campagna che lo ha. L'avviso diceva «2 campagne,
  // 4 giornate mancanti · la spesa è più bassa del vero» anche quando le due
  // campagne erano due Brand Protection da **0,11 €** e **5,95 €** in tutto il
  // mese: un allarme rosso per pochi centesimi, sopra una tabella da 13.000 €.
  // Quel tipo di avviso, letto tre volte a vuoto, smette di essere letto.
  // Ora si stima quanto varrebbero i giorni mancanti — media della campagna ×
  // giorni — e si dice di CHI sono.
  const nomiIncomplete = incomplete.length
    ? await prisma.campagna.findMany({
        where: { id: { in: incomplete.map((c) => c.campagnaId) } },
        select: { id: true, nome: true },
      })
    : [];
  const nomeDi = new Map(nomiIncomplete.map((c) => [c.id, c.nome]));
  const quali = incomplete
    .map((c) => {
      const mancanti = attesi - c._count._all;
      const media = c._count._all > 0 ? (c._sum.spesa ?? 0) / c._count._all : 0;
      return {
        nome: nomeDi.get(c.campagnaId) ?? c.campagnaId,
        giorniMancanti: mancanti,
        spesaStimata: media * mancanti,
      };
    })
    .sort((a, b) => b.spesaStimata - a.spesaStimata);
  const spesaStimataMancante = quali.reduce((s, c) => s + c.spesaStimata, 0);
  const spesaMese = [...spesaBrand.values()].reduce((s, v) => s + v, 0);
  const buchi =
    incomplete.length > 0
      ? {
          campagne: incomplete.length,
          giorniMancanti: incomplete.reduce((s, c) => s + (attesi - c._count._all), 0),
          quali,
          spesaStimataMancante,
          quotaSulMese: spesaMese > 0 ? spesaStimataMancante / spesaMese : null,
        }
      : null;

  const perBrand = (brand: string): RigaMese => {
    const sito = BRAND_SITO[brand];
    const p = piano.find((x) => x.sito === sito);
    const b = budget.find((x) => x.sito === sito);
    const o = ordini.find((x) => x.brand === brand);
    const vendite = o?._sum.totale ?? 0;
    const spesa = spesaBrand.get(brand) ?? 0;
    // L'obiettivo è quello del budget; se per quel mese non è stato compilato
    // si ripiega sul piano, che è meglio di niente — ma resta il ripiego.
    const obiettivo = b?.venditaPrevista ?? p?.vendite ?? null;
    return costruisci(brand, obiettivo, p?.budgetAdv ?? null, vendite, o?._count._all ?? 0, spesa, giorniTrascorsi, giorniMese);
  };

  const righe = ["gifts", "flowers", "cake"].map(perBrand);
  const totale = costruisci(
    "totale",
    // Il totale si somma dalle stesse righe mostrate sopra, non da una query
    // sua: se le due strade divergessero, la riga «Tutti i brand» non
    // combacerebbe con la somma di quelle che ha sopra, ed è il genere di
    // incoerenza che fa perdere fiducia in tutta la pagina.
    somma(righe.map((r) => r.pianoVendite)),
    somma(piano.map((p) => p.budgetAdv)),
    righe.reduce((s, r) => s + r.vendite, 0),
    righe.reduce((s, r) => s + r.ordini, 0),
    righe.reduce((s, r) => s + r.spesa, 0),
    giorniTrascorsi,
    giorniMese
  );

  return {
    anno,
    mese,
    giorniMese,
    giorniTrascorsi,
    giorniToccati,
    oggiIncluso: meseInCorso,
    righe,
    totale,
    canaliMuti,
    buchi,
  };
}

function somma(valori: (number | null)[]): number | null {
  const buoni = valori.filter((v): v is number => v != null);
  return buoni.length > 0 ? buoni.reduce((s, v) => s + v, 0) : null;
}

function costruisci(
  brand: string,
  pianoVendite: number | null,
  pianoBudgetAdv: number | null,
  vendite: number,
  ordini: number,
  spesa: number,
  giorniTrascorsi: number,
  giorniMese: number
): RigaMese {
  // ⚠️ Sotto il primo giorno pieno NON si proietta. Non è prudenza: dividere
  // per 0,04 giorni (l'una di notte del primo del mese) moltiplicherebbe per
  // venticinque qualunque cosa sia entrata, e la proiezione a fine mese
  // uscirebbe un numero da capogiro che non vuol dire niente.
  const misurabile = giorniTrascorsi >= 1;
  const vendtiteAlGiorno = misurabile ? vendite / giorniTrascorsi : null;
  const spesaAlGiorno = misurabile ? spesa / giorniTrascorsi : null;
  const stimaVendite = vendtiteAlGiorno != null ? vendtiteAlGiorno * giorniMese : null;
  const stimaSpesa = spesaAlGiorno != null ? spesaAlGiorno * giorniMese : null;

  return {
    brand,
    pianoVendite,
    pianoBudgetAdv,
    vendite,
    ordini,
    spesa,
    vendtiteAlGiorno,
    spesaAlGiorno,
    stimaVendite,
    stimaSpesa,
    quotaPiano: pianoVendite && pianoVendite > 0 && stimaVendite != null ? stimaVendite / pianoVendite : null,
    quotaBudget: pianoBudgetAdv && pianoBudgetAdv > 0 && stimaSpesa != null ? stimaSpesa / pianoBudgetAdv : null,
    ritmoPrevistoAdv: pianoBudgetAdv && pianoBudgetAdv > 0 ? pianoBudgetAdv / giorniMese : null,
    ros: spesa > 0 ? vendite / spesa : null,
    rosPiano:
      pianoVendite && pianoBudgetAdv && pianoBudgetAdv > 0 ? pianoVendite / pianoBudgetAdv : null,
  };
}

// Come sta andando il ritmo di spesa rispetto a quello previsto dal budget.
export function letturaRitmo(r: RigaMese): { testo: string; colore: string } | null {
  if (r.spesaAlGiorno == null || r.ritmoPrevistoAdv == null) return null;
  const rapporto = r.spesaAlGiorno / r.ritmoPrevistoAdv;
  if (rapporto > 1.15) {
    return {
      testo: `spende ${Math.round((rapporto - 1) * 100)}% più in fretta del budget`,
      colore: "var(--red)",
    };
  }
  if (rapporto < 0.85) {
    return {
      testo: `spende ${Math.round((1 - rapporto) * 100)}% più piano del budget`,
      colore: "var(--orange)",
    };
  }
  return { testo: "ritmo in linea col budget", colore: "var(--green)" };
}
