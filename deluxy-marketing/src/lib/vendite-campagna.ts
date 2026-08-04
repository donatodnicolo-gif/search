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

// La lingua della campagna, letta per quello che è davvero: **a chi vende**.
// "[Deluxy] Roma (Fiori) - English" non è una campagna in inglese, è la
// campagna che serve i clienti stranieri a Roma — e sull'ordine quella cosa è
// scritta, nel paese di consegna. Quindi la lingua **filtra** il venduto di
// contesto, non è solo un'etichetta.
export const LINGUE_CAMPAGNA = ["ita", "eng", "fra"] as const;
export const ETICHETTA_LINGUA: Record<string, string> = {
  ita: "Italiano — clienti italiani",
  eng: "Inglese — clienti stranieri",
  fra: "Francese — clienti in Francia",
  spa: "Spagnolo — clienti di lingua spagnola",
  ted: "Tedesco — clienti di lingua tedesca",
};

// Come si traduce la lingua in un filtro sul paese dell'ordine.
// `eng` non è "clienti inglesi": le campagne in inglese servono tutto quello
// che non è Italia (nei 90 giorni: FR 54, GB 13, US 6, IE, NL, AU, DE, ES, MC,
// BE, CH…), e restringere a GB butterebbe via l'80% di quel venduto.
export function filtroPaese(lingua: string | null): { descrizione: string; ammette: (paese: string | null) => boolean } | null {
  if (lingua === "ita") {
    return { descrizione: "clienti italiani (paese IT)", ammette: (p) => p === "IT" };
  }
  if (lingua === "eng") {
    return { descrizione: "clienti stranieri (paese diverso da IT)", ammette: (p) => p != null && p !== "IT" };
  }
  if (lingua === "fra") {
    return { descrizione: "clienti in Francia (paese FR)", ammette: (p) => p === "FR" };
  }
  return null;
}

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
  // Citta di consegna dedotta dal nome ("Torte ROMA" → Roma). Si confronta con
  // la citta DEDOTTA da Orders, non con quella scritta al checkout: quella ha
  // "Rome", "Milan" e i refusi, e un confronto sul testo perderebbe meta ordini.
  citta: string | null;
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

  // Le citta in cui Deluxy consegna davvero: cercarne altre nel nome non ha
  // senso, e un falso positivo qui filtrerebbe via ordini veri.
  const CITTA: [RegExp, string][] = [
    [/milano|milan/, "Milano"],
    [/roma|rome/, "Roma"],
    [/firenze|florence/, "Firenze"],
    [/torino|turin/, "Torino"],
    [/napoli|naples/, "Napoli"],
    [/venezia|venice/, "Venezia"],
    [/bologna/, "Bologna"],
    [/parigi|paris/, "Parigi"],
  ];
  let citta: string | null = null;
  for (const [regola, nome] of CITTA) {
    if (regola.test(t)) { citta = nome; break; }
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
  if (citta) pezzi.push(`citta ${citta} dal nome`);
  if (negozio) pezzi.push(`negozio dal brand ${campagna.brand}`);

  return { categoria, lingua, negozio, citta, motivo: pezzi.join(" · ") };
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
        citta: salvato.citta,
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
    salvato.negozio === dedotto.negozio &&
    salvato.citta === dedotto.citta;
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
  // Le citta di CONSEGNA: su campagne geolocalizzate (Fiori Milano, Torte ROMA)
  // dicono se gli ordini arrivano dove la campagna punta davvero.
  citta: { citta: string; ordini: number; vendite: number }[];
  // Le province di consegna. Più affidabili delle città come raggruppamento:
  // la sigla la scrive Orders, la città la scrive il cliente — e in provincia
  // di Milano convivono "Milano", "Milan" e "MILANO", che sono la stessa cosa.
  province: { provincia: string; ordini: number; vendite: number }[];
};

type OrdineLetto = {
  id: string;
  data: Date;
  totale: number | null;
  email: string | null;
  paese: string | null;
  citta: string | null;
  provincia: string | null;
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
  citta: [],
  province: [],
};

// Le citta arrivano scritte a mano dai clienti: "Roma" e "Rome", "Milano" e
// "Milan", con o senza accenti e maiuscole. Si riportano al nome italiano,
// altrimenti la stessa destinazione si spezza in due righe e nessuna delle due
// sembra contare.
const CITTA_ALTRE_LINGUE: Record<string, string> = {
  rome: "Roma", milan: "Milano", milano: "Milano", florence: "Firenze",
  turin: "Torino", naples: "Napoli", venice: "Venezia", genoa: "Genova",
  "reggio calabria": "Reggio Calabria",
};

// I capoluoghi dove Deluxy consegna: serve quando Orders manda la città ma non
// la sigla. Non è un elenco di tutte le province italiane — solo quelle che
// contano qui, perché una mappa incompleta usata come se fosse completa fa più
// danni di una mappa assente.
const PROVINCIA_DI_CITTA: Record<string, string> = {
  Milano: "MI", Roma: "RM", Firenze: "FI", Torino: "TO", Napoli: "NA",
  Venezia: "VE", Bologna: "BO", Genova: "GE", Palermo: "PA", Bari: "BA",
  Verona: "VR", Padova: "PD", Brescia: "BS", Como: "CO", Monza: "MB",
};

export function provinciaDaCitta(citta: string | null): string | null {
  return citta ? PROVINCIA_DI_CITTA[citta] ?? null : null;
}

export function nomeCitta(grezza: string | null): string | null {
  const t = grezza?.trim();
  if (!t) return null;
  const chiave = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (CITTA_ALTRE_LINGUE[chiave]) return CITTA_ALTRE_LINGUE[chiave];
  // Iniziali maiuscole: "MILANO" e "milano" diventano "Milano"
  return t
    .toLowerCase()
    .split(/s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function aggrega(ordini: OrdineLetto[], primoOrdineDi: Map<string, number>): BloccoVendite {
  if (ordini.length === 0) return { ...BLOCCO_VUOTO };

  const perCategoria = new Map<string, RigaCategoria>();
  const perPaese = new Map<string, number>();
  const perCitta = new Map<string, { ordini: number; vendite: number }>();
  const perProvincia = new Map<string, { ordini: number; vendite: number }>();
  let vendite = 0;
  let clientiNuovi = 0;
  let clientiRitorno = 0;
  let senzaEmail = 0;

  for (const o of ordini) {
    vendite += o.totale ?? 0;
    const paese = o.paese?.trim() || "—";
    perPaese.set(paese, (perPaese.get(paese) ?? 0) + 1);

    // "Roma" e "Rome" sono la stessa citta scritta da due clienti diversi:
    // senza normalizzare, la stessa destinazione compare due volte e nessuna
    // delle due sembra importante.
    const citta = nomeCitta(o.citta);
    if (citta) {
      const c = perCitta.get(citta) ?? { ordini: 0, vendite: 0 };
      c.ordini += 1;
      c.vendite += o.totale ?? 0;
      perCitta.set(citta, c);
    }

    // La provincia: quella di Orders quando c'è, altrimenti dedotta dalla città
    // per i capoluoghi in cui Deluxy consegna davvero. Fuori dall'Italia la
    // sigla non arriva quasi mai, e inventarla non avrebbe senso.
    const prov = o.provincia?.trim().toUpperCase() || provinciaDaCitta(citta);
    if (prov) {
      const pv = perProvincia.get(prov) ?? { ordini: 0, vendite: 0 };
      pv.ordini += 1;
      pv.vendite += o.totale ?? 0;
      perProvincia.set(prov, pv);
    }

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
    province: [...perProvincia.entries()]
      .map(([provincia, v]) => ({ provincia, ordini: v.ordini, vendite: v.vendite }))
      .sort((a, b) => b.ordini - a.ordini)
      .slice(0, 12),
    citta: [...perCitta.entries()]
      .map(([citta, v]) => ({ citta, ordini: v.ordini, vendite: v.vendite }))
      .sort((a, b) => b.ordini - a.ordini)
      .slice(0, 12),
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
  // Quello che dichiara la piattaforma nello stesso periodo: serve ai KPI
  // STIMATI, quelli che si possono dare anche quando l'UTM non c'è.
  conversioniDichiarate: number;
  ricaviDichiarati: number;
  // Legame 1: gli ordini che portano scritto l'UTM di questa campagna
  attribuite: BloccoVendite;
  // Ordini con un UTM che somiglia al nome ma non combacia (nomi vecchi,
  // campagne rinominate o divise): NON attribuiti, ma vanno detti.
  utmSimili: { valore: string; ordini: number }[];
  // Legame 2: il contesto dedotto dal nome. null se il nome non basta.
  contesto: BloccoVendite | null;
  // Come la lingua ha tagliato i clienti, e quanti ordini sono rimasti fuori
  // perché non hanno il paese.
  filtroClienti: string | null;
  senzaPaese: number;
  // Perché la lingua non ha potuto tagliare, quando non ha potuto.
  linguaIgnorata: string | null;
  // La citta del contesto: quale si e usata, o perche non si e potuta usare
  cittaFiltrata: string | null;
  cittaIgnorata: string | null;
  cittaViste: string[];
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
      select: { spesa: true, conversioni: true, ricavi: true },
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
        citta: true,
        provincia: true,
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
  const conversioniDichiarate = metriche.reduce((s, m) => s + (m.conversioni ?? 0), 0);
  const ricaviDichiarati = metriche.reduce((s, m) => s + (m.ricavi ?? 0), 0);
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
  // Il prodotto taglia le righe d'ordine, la lingua taglia i clienti: una
  // campagna inglese su Roma non ha niente a che vedere col venduto italiano
  // della stessa città, e sommarli farebbe sembrare enorme il mercato che
  // quella campagna può davvero prendere.
  const paese = filtroPaese(legame.lingua);
  let senzaPaese = 0;
  let contesto: BloccoVendite | null = null;
  let filtroClienti: string | null = null;
  let linguaIgnorata: string | null = null;
  let cittaFiltrata: string | null = null;
  let cittaIgnorata: string | null = null;
  if (legame.categoria) {
    let conProdotto = ordini.filter((o) => o.righe.some((r) => r.categoria === legame.categoria));

    // La citta, quando il nome la dice: "Torte ROMA" parla ai romani, e gli
    // ordini milanesi non sono il suo mercato. Si confronta con la citta
    // normalizzata, cosi "Rome" e "Roma" restano lo stesso posto.
    //
    // Stessa prudenza del paese: se il filtro lascia quasi nulla su un numero
    // di ordini che sarebbe stato significativo, NON si applica — vorrebbe dire
    // che la citta la scrivono in un modo che non riconosciamo, e uno zero li
    // si leggerebbe come "questa campagna non vende".
    if (legame.citta) {
      const inCitta = conProdotto.filter((o) => nomeCitta(o.citta) === legame.citta);
      if (inCitta.length >= 3 || conProdotto.length < 10) {
        conProdotto = inCitta;
        cittaFiltrata = legame.citta;
      } else {
        cittaIgnorata = `il nome della campagna dice ${legame.citta}, ma solo ${inCitta.length} ordini su ${conProdotto.length} risultano consegnati li: il filtro non si applica, sotto ci sono tutte le citta`;
      }
    }
    if (paese) {
      // Un ordine senza paese non si può assegnare né agli italiani né agli
      // stranieri: resta fuori e si dice quanti sono, invece di infilarlo
      // nella metà più comoda.
      senzaPaese = conProdotto.filter((o) => !o.paese?.trim()).length;
      const filtrati = conProdotto.filter((o) => paese.ammette(o.paese?.trim() || null));

      // ⚠️ Il paese sull'ordine è quello di **consegna**, non del cliente. Su
      // deluxy.it e cakedesign.me si consegna in Italia anche quando a comprare
      // è un turista o un'azienda estera: lì una campagna in inglese produce
      // ordini con paese IT, e filtrare per "diverso da IT" li azzera tutti.
      // Quando succede, il filtro non sta separando gli stranieri dagli
      // italiani — sta solo cancellando i dati. Meglio mostrare tutto e dire
      // perché, che mostrare uno zero che sembra "questa campagna non vende".
      if (filtrati.length < 3 && conProdotto.length >= 10) {
        contesto = aggrega(conProdotto, primoOrdineDi);
        linguaIgnorata = `il paese scritto sull'ordine è quello di CONSEGNA, non del cliente: qui ${filtrati.length} ordini su ${conProdotto.length} risultano ${paese.descrizione}, cioè il filtro non sta separando gli stranieri dagli italiani, li sta cancellando. Succede sui negozi che consegnano in Italia (deluxy.it, cakedesign.me) anche quando a comprare è un turista o un'azienda estera. Sotto ci sono quindi TUTTI i clienti del prodotto`;
      } else {
        contesto = aggrega(filtrati, primoOrdineDi);
        filtroClienti = paese.descrizione;
      }
    } else {
      contesto = aggrega(conProdotto, primoOrdineDi);
    }
  }

  return {
    da,
    a,
    giorni,
    spesa,
    conversioniDichiarate,
    ricaviDichiarati,
    attribuite: aggrega(attribuiti, primoOrdineDi),
    utmSimili: [...simili.entries()]
      .map(([valore, ordini]) => ({ valore, ordini }))
      .sort((x, y) => y.ordini - x.ordini)
      .slice(0, 4),
    contesto,
    filtroClienti,
    senzaPaese,
    linguaIgnorata,
    cittaFiltrata,
    cittaIgnorata,
    // Le citta che compaiono davvero negli ordini: sono le sole opzioni sensate
    // da offrire, invece di un elenco fisso che invecchia.
    cittaViste: [...new Set(ordini.map((o) => nomeCitta(o.citta)).filter((c): c is string => !!c))]
      .sort((a, b) => a.localeCompare(b, "it"))
      .slice(0, 40),
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

// I KPI **stimati**: quelli che si possono dare anche quando l'UTM non c'è.
//
// Perché servono. La maggior parte delle campagne non ha un solo ordine con
// l'UTM che combacia — i nomi cambiano, le campagne si dividono in ENG/ITA, e
// l'UTM sull'ordine resta quello vecchio. Lasciare la scheda senza nessun costo
// di acquisizione vuol dire non poter dire niente su quasi tutte le campagne.
//
// Da dove nascono, e perché sono stime e non misure:
//  - le **conversioni** sono quelle dichiarate dalla piattaforma. Google e Meta
//    contano anche view-through e finestre lunghe: sono più degli ordini veri.
//    Quindi questi costi sono la stima **ottimistica** — quella vera è più alta;
//  - lo **scontrino medio** e la **quota di clienti nuovi** arrivano dal
//    contesto (il venduto del prodotto e dei clienti di questa campagna), non
//    dalla campagna: sono la miglior cosa che si ha, non la sua misura.
//
// Se manca uno dei due pezzi il numero resta `null`: mezza stima è peggio di
// nessuna stima, perché ha lo stesso aspetto di un dato.
export type KpiStimati = {
  costoConversione: number | null;
  costoCliente: number | null;
  ros: number | null;
  quotaNuovi: number | null;
  scontrinoMedio: number | null;
};

export function kpiStimati(
  spesa: number,
  conversioniDichiarate: number,
  riferimento: BloccoVendite | null
): KpiStimati {
  const clientiNoti = riferimento ? riferimento.clientiNuovi + riferimento.clientiRitorno : 0;
  const quotaNuovi = clientiNoti > 0 ? riferimento!.clientiNuovi / clientiNoti : null;
  const scontrinoMedio = riferimento?.scontrinoMedio ?? null;
  const nuoviStimati = quotaNuovi != null ? conversioniDichiarate * quotaNuovi : null;

  return {
    costoConversione: spesa > 0 && conversioniDichiarate > 0 ? spesa / conversioniDichiarate : null,
    costoCliente: spesa > 0 && nuoviStimati != null && nuoviStimati >= 1 ? spesa / nuoviStimati : null,
    ros:
      spesa > 0 && scontrinoMedio != null && conversioniDichiarate > 0
        ? (scontrinoMedio * conversioniDichiarate) / spesa
        : null,
    quotaNuovi,
    scontrinoMedio,
  };
}
