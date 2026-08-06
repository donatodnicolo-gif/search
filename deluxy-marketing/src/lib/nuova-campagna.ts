import { prisma } from "@/lib/db";
import { breakEvenRoas } from "@/lib/guardrail";

import { testoKeywordPulito } from "@/lib/dominio";
import { CITTA_NOTE, EN_IT, IT_EN } from "@/lib/citta";

export { CITTA_NOTE };

// Preparare una campagna nuova partendo da quello che GIÀ FUNZIONA, invece che
// da un modulo vuoto.
//
// La pagina /campagne/lancia esiste da prima, ma chiede di scrivere a mano
// keyword, titoli e budget: cioè chiede di ricordarsi a memoria quali parole
// rendono e quali bruciano, mentre l'app quei numeri li ha. Qui si sceglie
// brand → categoria → località e il resto arriva dallo storico.
//
// ⚠️ Non propone MAI un dato che non ha. Ogni proposta dice da quante campagne
// e da quanta spesa nasce; sotto le soglie non si propone niente e si dichiara
// perché. Una keyword suggerita male finisce in una campagna vera e costa
// soldi veri.

// Sotto queste soglie non c'è statistica: la riga non entra fra i suggerimenti.
const MIN_CLIC_KEYWORD = 10;
const MIN_SPESA_KEYWORD = 20;
const MIN_CLIC_SITELINK = 20;

// Le città che sappiamo riconoscere dentro un nome di campagna o di keyword.
// Serve a due cose opposte: capire dove siamo già, e riscrivere per la città
// nuova una keyword che altrove funziona.
// ⚠️ Questa lista è il filtro di sicurezza, non un vezzo. Una keyword che
// nomina una città NON elencata passa invariata e finisce fra i suggerimenti
// con la città SBAGLIATA: provato il 29/07/2026 con «flowers delivery Como»
// proposta per Napoli. Chi aggiunge una città alle campagne la aggiunga anche
// qui — e vedi `scartaSeAltraCitta`, che è la rete sotto a questa.

// Le forme inglesi vanno tradotte quando si riscrive una keyword: "flowers
// delivery Milan" per Napoli diventa "flowers delivery Naples", non "Napoli".

// La rete sotto alla lista delle città: una keyword che nomina un LUOGO che
// non sappiamo riconoscere non va proposta per un'altra città, perché
// arriverebbe con la città sbagliata dentro. Nel dubbio si scarta: un
// suggerimento in meno non costa niente, uno sbagliato finisce in una campagna
// vera. Si riconosce dal fatto che ha una parola capitalizzata a metà frase
// che non è una città nota.
function scartaSeAltraCitta(testo: string, cittaScelta: string): boolean {
  const parole = testo.split(/\s+/).slice(1); // la prima parola può essere maiuscola per stile
  for (const p of parole) {
    const pulita = p.replace(/[^\p{L}]/gu, "");
    if (pulita.length < 4) continue;
    if (pulita[0] !== pulita[0].toUpperCase() || pulita[0] === pulita[0].toLowerCase()) continue;
    const min = pulita.toLowerCase();
    if (min === cittaScelta.toLowerCase() || min === (IT_EN[cittaScelta.toLowerCase()] ?? "")) continue;
    if (!CITTA_NOTE.includes(min)) return true;
  }
  return false;
}

export type CategoriaDisponibile = {
  categoria: string;
  righe: number;
  venduto: number;
  campagneCollegate: number;
};

/** Le categorie che il negozio vende DAVVERO, con quanto pesano. */
export async function categorieDisponibili(brand?: string): Promise<CategoriaDisponibile[]> {
  const righe = await prisma.rigaOrdine.groupBy({
    by: ["categoria"],
    _count: true,
    _sum: { totale: true },
    where: brand ? { ordine: { brand } } : undefined,
  });
  const legami = await prisma.legameCampagnaShopify.groupBy({ by: ["categoria"], _count: true });
  const perLegame = new Map(legami.map((l) => [l.categoria ?? "", l._count]));

  return righe
    // "servizio" non è un prodotto da promuovere: sono spedizioni, riconsegne
    // e gift card. Proporlo come categoria di campagna non vuol dire niente.
    .filter((r) => r.categoria && r.categoria !== "servizio")
    .map((r) => ({
      categoria: r.categoria as string,
      righe: r._count,
      venduto: r._sum.totale ?? 0,
      campagneCollegate: perLegame.get(r.categoria as string) ?? 0,
    }))
    .sort((a, b) => b.venduto - a.venduto);
}

export type LocalitaNota = { citta: string; campagne: number; spesa: number };

/** Dove siamo già presenti, dedotto dai nomi delle campagne. */
export async function localitaNote(brand?: string): Promise<LocalitaNota[]> {
  const campagne = await prisma.campagna.findMany({
    where: { ...(brand ? { brand } : {}), stato: { not: "defunta" } },
    select: { id: true, nome: true },
  });
  const perCitta = new Map<string, { campagne: number; ids: string[] }>();
  for (const c of campagne) {
    const t = c.nome.toLowerCase();
    for (const citta of CITTA_NOTE) {
      if (!t.includes(citta)) continue;
      const chiave = EN_IT[citta] ?? citta; // "milan" e "milano" sono la stessa città
      const v = perCitta.get(chiave) ?? { campagne: 0, ids: [] };
      v.campagne++;
      v.ids.push(c.id);
      perCitta.set(chiave, v);
      break;
    }
  }
  const fuori: LocalitaNota[] = [];
  for (const [citta, v] of perCitta) {
    const s = await prisma.metricaCampagna.aggregate({
      where: { campagnaId: { in: v.ids } },
      _sum: { spesa: true },
    });
    fuori.push({ citta, campagne: v.campagne, spesa: s._sum.spesa ?? 0 });
  }
  return fuori.sort((a, b) => b.spesa - a.spesa);
}

/**
 * La città di cui parla un nome di campagna, normalizzata all'italiano.
 * «[Deluxy] Roma (Fiori) - italian» → "roma"; «Fiori Milano ENG» → "milano".
 *
 * Serve a riconoscere quando una keyword parla di un'ALTRA città rispetto
 * alla campagna in cui sta: quasi sempre è uno sbaglio da correggere, non
 * un'occasione da cogliere.
 */
export function cittaDiNome(nome: string): string | null {
  const t = nome.toLowerCase();
  for (const citta of CITTA_NOTE) {
    if (!t.includes(citta)) continue;
    return EN_IT[citta] ?? citta;
  }
  return null;
}

/** Riscrive una keyword per un'altra città, rispettando la lingua del testo. */
export function perAltraCitta(testo: string, cittaNuova: string): string | null {
  const t = testo.toLowerCase();
  const nuovaIt = cittaNuova.toLowerCase();
  const nuovaEn = IT_EN[nuovaIt] ?? nuovaIt;
  for (const citta of CITTA_NOTE) {
    const i = t.indexOf(citta);
    if (i === -1) continue;
    // Se il testo è in inglese si usa il nome inglese della città nuova.
    const inglese = !!EN_IT[citta];
    const sostituto = inglese ? nuovaEn : nuovaIt;
    if (citta === nuovaIt || citta === nuovaEn) return null; // è già quella città
    const originale = testo.slice(i, i + citta.length);
    // Si conserva la maiuscola iniziale se c'era
    const conMaiuscola = originale[0] === originale[0].toUpperCase()
      ? sostituto.charAt(0).toUpperCase() + sostituto.slice(1)
      : sostituto;
    return testo.slice(0, i) + conMaiuscola + testo.slice(i + citta.length);
  }
  return null;
}

// Le parole che legano una campagna a una categoria di prodotto. Sono le
// stesse famiglie usate da `categoriaDa` sugli ordini, così le due letture
// parlano la stessa lingua.
const PAROLE_CATEGORIA: Record<string, RegExp> = {
  fiori: /fior|flower|rose|bouquet|peoni|orchide/i,
  torte: /tort|cake|cheesecake|pasticc/i,
  colazioni: /colazion|breakfast|brunch/i,
  dolci: /dolc|pralin|macaron|chocolat|cioccolat/i,
  palloncini: /palloncin|balloon/i,
  vini: /vino|wine|prosecco|bollicine/i,
  altro: /.^/, // non si aggancia a niente: "altro" non è una categoria da promuovere
};

export type Suggerimento = {
  testo: string;
  daCampagna: string;
  roas: number | null;
  spesa: number;
  clic: number;
  riscritta: boolean;
};

export type PropostaCampagna = {
  brand: string;
  categoria: string;
  citta: string;
  nomeSuggerito: string;
  breakEven: number;
  keyword: Suggerimento[];
  sitelink: Suggerimento[];
  titoli: string[];
  descrizioni: string[];
  budgetSuggerito: number | null;
  campagneEsaminate: number;
  spesaEsaminata: number;
  avvertenze: string[];
};

/**
 * Cosa mettere in una campagna nuova, preso da quelle che già girano.
 *
 * Il criterio è uno solo: si propone ciò che ha reso sopra il break-even DEL
 * BRAND (Gifts 3,33 · Flowers 2,5 · Cake 2,0), non sopra una soglia uguale per
 * tutti — lo stesso 2,5 è buono per Cake e una perdita per Gifts.
 */
export async function propostaCampagna(opzioni: {
  brand: string;
  categoria: string;
  citta: string;
}): Promise<PropostaCampagna> {
  const { brand, categoria, citta } = opzioni;
  const breakEven = breakEvenRoas(brand);
  const avvertenze: string[] = [];
  const regola = PAROLE_CATEGORIA[categoria] ?? /.^/;

  // Le campagne dello stesso brand che parlano di questa categoria.
  const campagne = await prisma.campagna.findMany({
    where: { brand, stato: { notIn: ["defunta"] } },
    select: { id: true, nome: true, budgetGiornaliero: true },
  });
  const affini = campagne.filter((c) => regola.test(c.nome));

  // Quanto hanno speso: serve a dire su che base si sta suggerendo.
  const spesaAgg = await prisma.metricaCampagna.aggregate({
    where: { campagnaId: { in: affini.map((c) => c.id) } },
    _sum: { spesa: true },
  });
  const spesaEsaminata = spesaAgg._sum.spesa ?? 0;

  if (affini.length === 0) {
    avvertenze.push(
      `Nessuna campagna di ${brand} parla di «${categoria}»: non c'è niente da cui copiare, e quello che segue sarebbe inventato. Meglio partire dalle keyword scritte a mano.`
    );
  }

  // ---- Keyword ----
  // Si guardano quelle di TUTTI i brand: una parola che rende su Flowers può
  // rendere su Gifts. Il break-even però resta quello del brand di DESTINAZIONE.
  const kwGrezze = await prisma.copyAnnuncio.findMany({
    where: {
      tipo: "keyword",
      clic: { gte: MIN_CLIC_KEYWORD },
      spesa: { gte: MIN_SPESA_KEYWORD },
      incasso: { not: null, gt: 0 },
    },
    select: { testo: true, campagna: true, incasso: true, spesa: true, clic: true },
    orderBy: { incasso: "desc" },
    take: 400,
  });

  const keyword: Suggerimento[] = [];
  const visti = new Set<string>();
  for (const k of kwGrezze) {
    const pulito = testoKeywordPulito(k.testo);
    if (!regola.test(pulito) && !regola.test(k.campagna)) continue;
    const roas = (k.incasso ?? 0) / (k.spesa || 1);
    if (roas < breakEven) continue;

    // Se la parola nomina un'altra città, si riscrive per questa: è il senso
    // dell'esercizio — «a Milano "fiori milano" rende 12×, per Napoli parti da
    // "fiori napoli"». Se non nomina città, va bene com'è.
    const riscritto = perAltraCitta(pulito, citta);
    const testo = riscritto ?? pulito;
    // Se dopo la riscrittura resta dentro un luogo che non sappiamo
    // riconoscere, la parola non si propone: arriverebbe con la città
    // sbagliata (è il caso di «flowers delivery Como» proposta per Napoli).
    if (scartaSeAltraCitta(testo, citta)) continue;
    const chiave = testo.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    keyword.push({
      testo,
      daCampagna: k.campagna,
      roas,
      spesa: k.spesa ?? 0,
      clic: k.clic ?? 0,
      riscritta: riscritto != null,
    });
    if (keyword.length >= 15) break;
  }
  if (keyword.length === 0) {
    avvertenze.push(
      `Nessuna keyword di «${categoria}» ha superato il break-even di ${brand} (${breakEven.toFixed(2)}×) con almeno ${MIN_CLIC_KEYWORD} clic e ${MIN_SPESA_KEYWORD} € di spesa. Non è un errore: vuol dire che su questa categoria non abbiamo ancora niente di provato.`
    );
  }

  // ---- Sitelink ----
  const slGrezzi = await prisma.copyAnnuncio.findMany({
    where: { tipo: "sitelink", brand, clic: { gte: MIN_CLIC_SITELINK }, spesa: { not: null, gt: 0 } },
    select: { testo: true, campagna: true, incasso: true, spesa: true, clic: true },
  });
  const sitelink: Suggerimento[] = slGrezzi
    .map((s) => ({
      testo: s.testo,
      daCampagna: s.campagna,
      roas: (s.incasso ?? 0) / (s.spesa || 1),
      spesa: s.spesa ?? 0,
      clic: s.clic ?? 0,
      riscritta: false,
    }))
    .filter((s) => (s.roas ?? 0) >= breakEven)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
    .slice(0, 6);

  // ---- Titoli e descrizioni ----
  // ⚠️ NON sono "i migliori": Google non assegna l'etichetta di rendimento a
  // questi asset (sono tutti NOT_APPLICABLE). Sono i testi usati dalle
  // campagne affini, e vanno riletti — non incollati a occhi chiusi.
  const testi = await prisma.copyAnnuncio.findMany({
    where: { tipo: { in: ["titolo", "descrizione"] }, brand, campagna: { in: affini.map((c) => c.nome) } },
    select: { testo: true, tipo: true },
    take: 200,
  });
  const titoli = [...new Set(testi.filter((t) => t.tipo === "titolo").map((t) => t.testo))]
    .filter((t) => t.length <= 30)
    .slice(0, 12);
  const descrizioni = [...new Set(testi.filter((t) => t.tipo === "descrizione").map((t) => t.testo))]
    .filter((t) => t.length <= 90)
    .slice(0, 4);
  if (titoli.length > 0) {
    avvertenze.push(
      "I titoli qui sotto sono quelli usati dalle campagne affini, NON «i migliori»: Google non assegna a questi asset un'etichetta di rendimento (sono tutti NOT_APPLICABLE), quindi non esiste un dato che dica quale funziona. Vanno riletti e adattati alla città."
    );
  }

  // ---- Budget ----
  // La mediana, non la media: una campagna con un budget fuori scala
  // trascinerebbe la media e farebbe partire la nuova col piede sbagliato.
  const budget = affini.map((c) => c.budgetGiornaliero).filter((b): b is number => b != null && b > 0).sort((a, b) => a - b);
  const budgetSuggerito = budget.length ? budget[Math.floor(budget.length / 2)] : null;
  if (budgetSuggerito == null && affini.length > 0) {
    avvertenze.push("Nessuna campagna affine ha un budget registrato: il budget va deciso a mano.");
  }

  const nomeCitta = citta.charAt(0).toUpperCase() + citta.slice(1);
  const etichettaCat = categoria.charAt(0).toUpperCase() + categoria.slice(1);

  return {
    brand,
    categoria,
    citta,
    // Lo stesso stampo dei nomi già in uso ("[Deluxy] Torte ROMA"): se il nome
    // segue la convenzione, l'ingest riconosce la campagna e le viste per
    // prodotto e città la trovano da sole.
    nomeSuggerito: `[Deluxy] ${etichettaCat} ${nomeCitta.toUpperCase()}`,
    breakEven,
    keyword,
    sitelink,
    titoli,
    descrizioni,
    budgetSuggerito,
    campagneEsaminate: affini.length,
    spesaEsaminata,
    avvertenze,
  };
}
