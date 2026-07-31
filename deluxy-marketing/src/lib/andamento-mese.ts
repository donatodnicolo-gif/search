import { prisma } from "@/lib/db";

// Il foglio SALES del Monitoraggio, calcolato dai dati veri invece che a mano.
//
// Risponde a tre domande, per ogni brand e per il totale:
//   1. quanto abbiamo venduto finora, e a che ritmo;
//   2. dove finiremo a fine mese se il ritmo resta questo;
//   3. la spesa pubblicitaria sta dentro il budget, giorno per giorno.
//
// DUE ONESTÀ CHE NON SI POSSONO SALTARE
// · Oggi è un giorno a metà: la spesa arriva la sera e gli ordini arrivano fino
//   a mezzanotte. Le medie si fanno sui giorni CONCLUSI, altrimenti l'ultimo
//   giorno tira giù la media e la stima esce più bassa del vero.
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
  giorniConclusi: number;
  oggiIncluso: boolean;
  righe: RigaMese[];
  totale: RigaMese;
  // Canali che non stanno mandando spesa: senza, il budget sembra rispettato
  canaliMuti: string[];
  // Campagne con giorni mancanti nel mese: la spesa risulta più bassa del vero
  // e il budget sembra rispettato quando non lo è. È un buco d'archivio, non un
  // risparmio, e va detto prima che qualcuno ci prenda una decisione.
  buchi: { campagne: number; giorniMancanti: number } | null;
};

const BRAND_SITO: Record<string, string> = { gifts: "gifts", flowers: "flowers", cake: "cake" };

export async function andamentoMese(anno: number, mese: number): Promise<AndamentoMese> {
  const inizio = new Date(anno, mese - 1, 1);
  const inizioProssimo = new Date(anno, mese, 1);
  const giorniMese = Math.round((inizioProssimo.getTime() - inizio.getTime()) / 86_400_000);

  const adesso = new Date();
  const meseInCorso = adesso.getFullYear() === anno && adesso.getMonth() === mese - 1;
  // Giorni conclusi: se il mese è passato sono tutti, se è in corso sono quelli
  // prima di oggi. Se siamo al primo del mese non c'è ancora un ritmo da leggere.
  const giorniConclusi = meseInCorso ? adesso.getDate() - 1 : giorniMese;

  const fine = meseInCorso ? new Date(anno, mese - 1, adesso.getDate()) : inizioProssimo;

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
  });
  const attesi = Math.max(giorniConclusi, 1);
  const incomplete = giorniPerCampagna.filter((c) => c._count._all < attesi * 0.9);
  const buchi =
    incomplete.length > 0
      ? {
          campagne: incomplete.length,
          giorniMancanti: incomplete.reduce((s, c) => s + (attesi - c._count._all), 0),
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
    return costruisci(brand, obiettivo, p?.budgetAdv ?? null, vendite, o?._count._all ?? 0, spesa, giorniConclusi, giorniMese);
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
    giorniConclusi,
    giorniMese
  );

  return {
    anno,
    mese,
    giorniMese,
    giorniConclusi,
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
  giorniConclusi: number,
  giorniMese: number
): RigaMese {
  // Con zero giorni conclusi non si inventa un ritmo: si dice che non c'è.
  const vendtiteAlGiorno = giorniConclusi > 0 ? vendite / giorniConclusi : null;
  const spesaAlGiorno = giorniConclusi > 0 ? spesa / giorniConclusi : null;
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
