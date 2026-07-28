import { prisma } from "./db";
import { normalizza } from "./ingest-metriche";

// Le vendite Shopify accanto alla spesa di una campagna.
//
// ⚠️ Qui dentro convivono DUE legami che non vanno mai confusi, ed è il motivo
// per cui questo file esiste invece di una query sola:
//
//   1. ATTRIBUZIONE — l'ordine porta scritto l'UTM della campagna
//      (`Ordine.utmCampagna`). È l'unico legame vero: quell'ordine è arrivato
//      da lì, lo dice Shopify. Solo su questo si calcolano i KPI (ROS reale,
//      costo di acquisizione, costo per conversione).
//
//   2. CONTESTO — la campagna si chiama "[Deluxy] Torte ROMA", quindi parla di
//      torte in italiano, e nello stesso periodo le torte hanno venduto tot.
//      È utile per capire il mercato intorno alla campagna, ma NON dice che
//      quelle vendite arrivino dalla campagna. Nessun KPI ci si appoggia, e la
//      pagina lo scrive a lettere chiare.
//
// Il legame 2 sta in `LegameCampagnaShopify`: si deduce dal nome e si corregge
// a mano dalla scheda. La correzione manuale non viene mai sovrascritta.

export const CATEGORIE_ORDINE = [
  "fiori",
  "torte",
  "colazioni",
  "dolci",
  "palloncini",
  "vini",
  "altro",
] as const;

export const ETICHETTA_CATEGORIA_ORDINE: Record<string, string> = {
  fiori: "Fiori",
  torte: "Torte",
  colazioni: "Colazioni",
  dolci: "Dolci e pasticceria",
  palloncini: "Palloncini",
  vini: "Vini",
  servizio: "Spedizioni e servizi",
  altro: "Altro",
};

export const LINGUE_CAMPAGNA = ["ita", "eng", "fra"] as const;
export const ETICHETTA_LINGUA: Record<string, string> = {
  ita: "Italiano",
  eng: "Inglese",
  fra: "Francese",
};

// I negozi come li scrive l'import degli ordini (import-ordini-da-orders.mjs).
export const NEGOZI_ORDINE = ["deluxygifts", "deluxyflowers", "cakedesignme"] as const;
export const ETICHETTA_NEGOZIO: Record<string, string> = {
  deluxygifts: "deluxy.it (Gifts)",
  deluxyflowers: "deluxyflowers.com",
  cakedesignme: "cakedesign.me",
};

const NEGOZIO_DI_BRAND: Record<string, string> = {
  gifts: "deluxygifts",
  flowers: "deluxyflowers",
  cake: "cakedesignme",
};

// Ordini che non sono vendite: la stessa esclusione del resto dell'app.
const STATI_NON_VENDUTI = ["annullato", "rimborsato"];

export type Legame = {
  categoria: string | null;
  lingua: string | null;
  negozio: string | null;
  motivo: string | null;
};

// La deduzione dal nome della campagna. Non indovina: se il nome non nomina un
// prodotto, `categoria` resta null e il blocco di contesto lo dice — meglio
// "non deducibile" che una categoria sbagliata (una campagna Brand Protection
// non è una campagna di fiori solo perché il brand vende fiori).
export function deduciLegame(campagna: { nome: string; brand: string }): Legame {
  const t = campagna.nome.toLowerCase();

  // Prima regola che aggancia, vince: l'ordine conta ("Cake Design" è torte,
  // non dolci). La parola che ha deciso finisce nel motivo, così in pagina si
  // vede subito quando è stata la parola sbagliata a scegliere.
  const REGOLE: [RegExp, string][] = [
    [/fiori|flower|fleur|bouquet|rose|peonie|orchidee/, "fiori"],
    [/torte|torta|cake|cakedesign/, "torte"],
    [/colazion|breakfast|brunch/, "colazioni"],
    [/palloncin|balloon/, "palloncini"],
    [/wine|vino|bollicine|prosecco|sommelier/, "vini"],
    [/panettone|panettoni|pasticceria|pralin|dolci|macaron/, "dolci"],
  ];
  let categoria: string | null = null;
  let parola: string | null = null;
  for (const [regola, cat] of REGOLE) {
    const m = t.match(regola);
    if (m) {
      categoria = cat;
      parola = m[0];
      break;
    }
  }

  let lingua: string | null = null;
  if (/\beng\b|english|\ben\b/.test(t)) lingua = "eng";
  else if (/\bita\b|italian|italiano/.test(t)) lingua = "ita";
  else if (/\bfr\b|french|francia|france|\bfra\b/.test(t)) lingua = "fra";

  const negozio = NEGOZIO_DI_BRAND[campagna.brand] ?? null;

  const pezzi: string[] = [];
  if (categoria) pezzi.push(`prodotto da «${parola}» nel nome`);
  else pezzi.push("nessun prodotto riconosciuto nel nome");
  if (lingua) pezzi.push(`lingua ${ETICHETTA_LINGUA[lingua]}`);
  if (negozio) pezzi.push(`negozio dal brand ${campagna.brand}`);

  return { categoria, lingua, negozio, motivo: pezzi.join(" · ") };
}

// Legge il legame salvato; se non c'è, lo deduce e lo salva. Se c'è ed è
// `manuale`, lo restituisce così com'è: la scelta a mano vince sempre e nessun
// giro successivo la tocca. Se è `dedotto` e la deduzione oggi dà un risultato
// diverso (la campagna è stata rinominata), si aggiorna.
export async function legameDiCampagna(campagna: {
  id: string;
  nome: string;
  brand: string;
}): Promise<{ legame: Legame; origine: string; aggiornatoIl: Date | null }> {
  const salvato = await prisma.legameCampagnaShopify.findUnique({
    where: { campagnaId: campagna.id },
  });
  if (salvato?.origine === "manuale") {
    return {
      legame: {
        categoria: salvato.categoria,
        lingua: salvato.lingua,
        negozio: salvato.negozio,
        motivo: salvato.motivo,
      },
      origine: "manuale",
      aggiornatoIl: salvato.aggiornatoIl,
    };
  }

  const dedotto = deduciLegame(campagna);
  const uguale =
    salvato &&
    salvato.categoria === dedotto.categoria &&
    salvato.lingua === dedotto.lingua &&
    salvato.negozio === dedotto.negozio;
  if (!uguale) {
    await prisma.legameCampagnaShopify
      .upsert({
        where: { campagnaId: campagna.id },
        create: { campagnaId: campagna.id, ...dedotto, origine: "dedotto" },
        update: { ...dedotto, origine: "dedotto" },
      })
      .catch(() => {}); // l'indice non deve poter rompere la pagina
  }
  return { legame: dedotto, origine: "dedotto", aggiornatoIl: salvato?.aggiornatoIl ?? null };
}

export type RigaCategoria = {
  categoria: string;
  valore: number;
  pezzi: number;
  ordini: number;
};

export type BloccoVendite = {
  ordini: number;
  vendite: number;
  scontrinoMedio: number | null;
  clientiNuovi: number;
  clientiRitorno: number;
  senzaEmail: number;
  perCategoria: RigaCategoria[];
  // Solo per il blocco di contesto: da dove arrivano gli ordini
  paesi: { paese: string; ordini: number }[];
};

type OrdineLetto = {
  id: string;
  data: Date;
  totale: number | null;
  email: string | null;
  paese: string | null;
  utmCampagna: string | null;
  righe: { titolo: string; categoria: string | null; quantita: number; totale: number | null; prezzo: number | null }[];
};

const BLOCCO_VUOTO: BloccoVendite = {
  ordini: 0,
  vendite: 0,
  scontrinoMedio: null,
  clientiNuovi: 0,
  clientiRitorno: 0,
  senzaEmail: 0,
  perCategoria: [],
  paesi: [],
};

function aggrega(ordini: OrdineLetto[], primoOrdineDi: Map<string, number>): BloccoVendite {
  if (ordini.length === 0) return { ...BLOCCO_VUOTO };

  const perCategoria = new Map<string, RigaCategoria>();
  const perPaese = new Map<string, number>();
  let vendite = 0;
  let clientiNuovi = 0;
  let clientiRitorno = 0;
  let senzaEmail = 0;

  for (const o of ordini) {
    vendite += o.totale ?? 0;
    const paese = o.paese?.trim() || "—";
    perPaese.set(paese, (perPaese.get(paese) ?? 0) + 1);

    // Nuovo o di ritorno: si guarda se questo è il PRIMO ordine mai registrato
    // per quella email. Senza email non si può dire, e non si tira a indovinare.
    const email = o.email?.trim().toLowerCase();
    if (!email) senzaEmail++;
    else {
      const primo = primoOrdineDi.get(email);
      if (primo != null && o.data.getTime() > primo) clientiRitorno++;
      else clientiNuovi++;
    }

    for (const r of o.righe) {
      const cat = r.categoria ?? "altro";
      if (cat === "servizio") continue; // spedizioni e riconsegne non sono prodotto
      const voce = perCategoria.get(cat) ?? { categoria: cat, valore: 0, pezzi: 0, ordini: 0 };
      voce.valore += r.totale ?? (r.prezzo ?? 0) * r.quantita;
      voce.pezzi += r.quantita;
      voce.ordini += 1;
      perCategoria.set(cat, voce);
    }
  }

  return {
    ordini: ordini.length,
    vendite,
    scontrinoMedio: ordini.length > 0 ? vendite / ordini.length : null,
    clientiNuovi,
    clientiRitorno,
    senzaEmail,
    perCategoria: [...perCategoria.values()].sort((a, b) => b.valore - a.valore),
    paesi: [...perPaese.entries()]
      .map(([paese, ordini]) => ({ paese, ordini }))
      .sort((a, b) => b.ordini - a.ordini)
      .slice(0, 5),
  };
}

export type VenditeCampagna = {
  da: Date;
  a: Date;
  giorni: number;
  spesa: number;
  // Legame 1: gli ordini che portano scritto l'UTM di questa campagna
  attribuite: BloccoVendite;
  // Ordini con un UTM che somiglia al nome ma non combacia (nomi vecchi,
  // campagne rinominate o divise): NON attribuiti, ma vanno detti.
  utmSimili: { valore: string; ordini: number }[];
  // Legame 2: il contesto dedotto dal nome. null se il nome non basta.
  contesto: BloccoVendite | null;
  legame: Legame;
  origineLegame: string;
  // Da quando parte il registro ordini: "cliente nuovo" vuol dire "prima volta
  // che compare qui", non "prima volta in assoluto".
  primoOrdineRegistrato: Date | null;
};

export async function venditeDiCampagna(
  campagna: { id: string; nome: string; brand: string; idEsterno: string | null },
  giorni = 30
): Promise<VenditeCampagna> {
  const a = new Date();
  const da = new Date();
  da.setHours(0, 0, 0, 0);
  da.setDate(da.getDate() - (giorni - 1));

  const { legame, origine } = await legameDiCampagna(campagna);

  // Una lettura sola degli ordini del periodo per il negozio della campagna, e
  // poi il taglio in memoria: una query per riga qui vorrebbe dire centinaia di
  // andate e ritorno e la pagina morirebbe di timeout.
  const [metriche, ordini, primi, primoAssoluto] = await Promise.all([
    prisma.metricaCampagna.findMany({
      where: { campagnaId: campagna.id, data: { gte: da } },
      select: { spesa: true },
    }),
    prisma.ordine.findMany({
      where: {
        data: { gte: da, lte: a },
        stato: { notIn: STATI_NON_VENDUTI },
        ...(legame.negozio ? { negozio: legame.negozio } : { brand: campagna.brand }),
      },
      select: {
        id: true,
        data: true,
        totale: true,
        email: true,
        paese: true,
        utmCampagna: true,
        righe: { select: { titolo: true, categoria: true, quantita: true, totale: true, prezzo: true } },
      },
    }),
    // Primo ordine per email nello stesso negozio: una groupBy sola, senza
    // liste di id in IN(...).
    prisma.ordine.groupBy({
      by: ["email"],
      where: {
        stato: { notIn: STATI_NON_VENDUTI },
        email: { not: null },
        ...(legame.negozio ? { negozio: legame.negozio } : { brand: campagna.brand }),
      },
      _min: { data: true },
    }),
    prisma.ordine.findFirst({ orderBy: { data: "asc" }, select: { data: true } }),
  ]);

  const spesa = metriche.reduce((s, m) => s + (m.spesa ?? 0), 0);
  const primoOrdineDi = new Map<string, number>();
  for (const p of primi) {
    const email = p.email?.trim().toLowerCase();
    if (email && p._min.data) primoOrdineDi.set(email, p._min.data.getTime());
  }

  // ——— Legame 1: attribuzione via UTM ———
  // Confronto sui nomi normalizzati (stesso metro dell'import) più l'id della
  // piattaforma, che alcune campagne Meta scrivono al posto del nome.
  const nomeNorm = normalizza(campagna.nome);
  const idEsterno = campagna.idEsterno?.trim();
  const combacia = (utm: string) => {
    const u = utm.trim();
    if (!u) return false;
    if (idEsterno && u === idEsterno) return true;
    return normalizza(u) === nomeNorm;
  };

  const attribuiti: OrdineLetto[] = [];
  const simili = new Map<string, number>();
  for (const o of ordini) {
    const utm = o.utmCampagna?.trim();
    if (!utm) continue;
    if (combacia(utm)) {
      attribuiti.push(o);
      continue;
    }
    // "Somiglia" = uno dei due nomi normalizzati contiene l'altro. È il caso
    // delle campagne rinominate o divise in ENG/ITA: l'ordine porta il nome
    // vecchio e non si può dire a quale delle due nuove appartenga.
    const un = normalizza(utm);
    if (un.length >= 6 && (un.startsWith(nomeNorm) || nomeNorm.startsWith(un))) {
      simili.set(utm, (simili.get(utm) ?? 0) + 1);
    }
  }

  // ——— Legame 2: contesto dedotto ———
  const contesto = legame.categoria
    ? aggrega(
        ordini.filter((o) => o.righe.some((r) => r.categoria === legame.categoria)),
        primoOrdineDi
      )
    : null;

  return {
    da,
    a,
    giorni,
    spesa,
    attribuite: aggrega(attribuiti, primoOrdineDi),
    utmSimili: [...simili.entries()]
      .map(([valore, ordini]) => ({ valore, ordini }))
      .sort((x, y) => y.ordini - x.ordini)
      .slice(0, 4),
    contesto,
    legame,
    origineLegame: origine,
    primoOrdineRegistrato: primoAssoluto?.data ?? null,
  };
}

// I tre KPI che si possono calcolare SOLO sull'attribuzione: mettere la spesa
// sopra il venduto di contesto darebbe un ROS inventato.
export type KpiVendite = {
  ros: number | null;
  costoCliente: number | null;
  costoConversione: number | null;
};

export function kpiVendite(spesa: number, b: BloccoVendite): KpiVendite {
  return {
    ros: spesa > 0 ? b.vendite / spesa : null,
    costoCliente: b.clientiNuovi > 0 ? spesa / b.clientiNuovi : null,
    costoConversione: b.ordini > 0 ? spesa / b.ordini : null,
  };
}
