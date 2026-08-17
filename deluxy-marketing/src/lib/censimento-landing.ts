import { prisma } from "@/lib/db";

// Il censimento delle landing a partire da DOVE MANDANO GLI ANNUNCI.
//
// `/landing` mostra `LandingPage`, che si riempie SOLO a mano dal bottone
// «Registra landing»: al 17/08/2026 erano 27 righe contro 329 URL su cui gli
// annunci mandano davvero traffico. Ma il dato per riempirla c'è già: dal
// 04/08 lo script porta la destinazione di ogni annuncio (`tipo: destinazione`)
// e la URL di ogni sitelink, e su quelle righe c'è il NOME della campagna.
//
// Quindi non serve indovinare niente: per ogni URL si sa quali campagne ci
// mandano, se quelle campagne stanno girando e quanto hanno speso gli annunci
// che ci puntano.

export type CampagnaCheManda = {
  id: string | null;
  nome: string;
  /**
   * Vero quando non è una campagna: gli asset di LIVELLO ACCOUNT arrivano con
   * `campagna = "(account 248-656-1148)"` (è lo script che ci mette quel
   * segnaposto, `leggiAsset`). Senza distinguerlo, 15 URL mostravano una
   * finta campagna «ferma» — che è il contrario della verità: un sitelink di
   * account vale per TUTTE le campagne dell'account, quindi è vivo se lo è
   * l'account.
   */
  livelloAccount: boolean;
  /** Il giudizio nostro: attiva | in_pausa | bozza | defunta… */
  stato: string;
  /** Il fatto di Google: ENABLED | PAUSED | REMOVED. Comanda questo. */
  statoPiattaforma: string | null;
  brand: string;
  /** Vero se su Google sta erogando adesso. */
  viva: boolean;
};

export type UrlInUso = {
  /** Normalizzata come si salva in `LandingPage`: senza protocollo né www. */
  url: string;
  /** Una delle forme viste per intero, per poterci cliccare sopra. */
  urlIntera: string;
  annunci: number;
  sitelink: number;
  /**
   * Spesa degli ANNUNCI che mandano qui, nella finestra del copy (30 giorni).
   * ⚠️ NON è «quanto ha speso questa pagina» in assoluto e non comprende i
   * sitelink: quelli portano una finestra loro (365 giorni) e sommare due
   * finestre diverse produrrebbe un numero che non vuol dire niente.
   */
  spesaAnnunci: number | null;
  campagne: CampagnaCheManda[];
  campagneVive: number;
  brand: string;
  /** Vero se il brand è dedotto dal dominio e non preso dalle campagne. */
  brandDedotto: boolean;
  lingua: string | null;
  giaRegistrata: boolean;
};

/** Come si scrive una URL in `LandingPage`: senza protocollo, www, query, barra finale. */
export function normalizzaUrl(u: string | null | undefined): string {
  return String(u ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");
}

// Il brand quando nessuna campagna lo dice: si guarda il dominio. È un ripiego
// dichiarato (`brandDedotto`), non un fatto — e a schermo si vede scritto.
const BRAND_DI_DOMINIO: { pezzo: string; brand: string }[] = [
  { pezzo: "deluxyflowers", brand: "flowers" },
  { pezzo: "cakedesign", brand: "cake" },
  { pezzo: "deluxygifts", brand: "gifts" },
  { pezzo: "deluxy-boutique", brand: "gifts" },
  { pezzo: "deluxy.it", brand: "gifts" },
];

function brandDaDominio(url: string): string {
  for (const d of BRAND_DI_DOMINIO) if (url.includes(d.pezzo)) return d.brand;
  return "cross";
}

/** La lingua dal prefisso del percorso: /en, /fr, /es. Senza prefisso è italiano. */
function linguaDaUrl(url: string): string | null {
  const dopoDominio = url.split("/").slice(1);
  const primo = dopoDominio[0];
  if (primo === "en") return "en";
  if (primo === "fr") return "fr";
  if (primo === "es") return "es";
  if (primo === "it") return "it";
  return null;
}

export async function urlInUso(): Promise<UrlInUso[]> {
  const [righe, metricheAnnuncio, campagne, registrate] = await Promise.all([
    prisma.copyAnnuncio.findMany({
      where: { tipo: { in: ["destinazione", "sitelink"] }, finalUrl: { not: null } },
      select: { finalUrl: true, tipo: true, campagna: true, idEsterno: true, spesa: true },
    }),
    // Le righe dei NUMERI per annuncio: stessa `idEsterno` delle destinazioni
    // (account:gruppo:idAnnuncio), quindi la spesa di chi manda a una certa
    // pagina si ottiene senza chiedere niente in più a Google.
    prisma.copyAnnuncio.findMany({
      where: { tipo: "annuncio", spesa: { not: null } },
      select: { idEsterno: true, spesa: true },
    }),
    prisma.campagna.findMany({
      select: { id: true, nome: true, stato: true, statoPiattaforma: true, brand: true },
    }),
    prisma.landingPage.findMany({ select: { url: true } }),
  ]);

  const spesaDiAnnuncio = new Map<string, number>();
  for (const m of metricheAnnuncio) {
    if (m.idEsterno) spesaDiAnnuncio.set(m.idEsterno, m.spesa ?? 0);
  }
  const campagnaDiNome = new Map(campagne.map((c) => [c.nome, c]));
  const giaRegistrate = new Set(registrate.map((l) => normalizzaUrl(l.url)));

  type Accumulo = {
    urlIntera: string;
    annunci: number;
    sitelink: number;
    spesa: number;
    conSpesa: boolean;
    nomiCampagne: Set<string>;
  };
  const per = new Map<string, Accumulo>();

  for (const r of righe) {
    const url = normalizzaUrl(r.finalUrl);
    if (!url) continue;
    let a = per.get(url);
    if (!a) {
      a = { urlIntera: String(r.finalUrl), annunci: 0, sitelink: 0, spesa: 0, conSpesa: false, nomiCampagne: new Set() };
      per.set(url, a);
    }
    if (r.tipo === "sitelink") a.sitelink++;
    else a.annunci++;
    if (r.campagna) a.nomiCampagne.add(r.campagna);
    // Solo la spesa degli ANNUNCI: i sitelink hanno una finestra diversa.
    if (r.tipo === "destinazione" && r.idEsterno) {
      const s = spesaDiAnnuncio.get(r.idEsterno);
      if (s != null) {
        a.spesa += s;
        a.conSpesa = true;
      }
    }
  }

  const fuori: UrlInUso[] = [];
  for (const [url, a] of per) {
    const campagne: CampagnaCheManda[] = [...a.nomiCampagne].map((nome) => {
      const c = campagnaDiNome.get(nome);
      const livelloAccount = /^\(account /.test(nome);
      if (livelloAccount) {
        return {
          id: null,
          nome: "asset di account",
          livelloAccount: true,
          stato: "account",
          statoPiattaforma: null,
          brand: "cross",
          // Un asset di account vale per tutte le campagne dell'account: è in
          // uso finché l'account eroga. Darlo per «fermo» sarebbe falso.
          viva: true,
        };
      }
      return {
        id: c?.id ?? null,
        nome,
        livelloAccount: false,
        stato: c?.stato ?? "sconosciuto",
        statoPiattaforma: c?.statoPiattaforma ?? null,
        brand: c?.brand ?? "cross",
        // ⚠️ Comanda il FATTO di Google, non il giudizio nostro: una campagna
        // può essere «in pausa» nell'app e ENABLED su Google, e in quel caso
        // sta ancora spendendo (successo davvero, vedi Catering Milan B2B).
        // Quando Google non l'ha ancora detta si ripiega sul nostro stato.
        viva: c?.statoPiattaforma
          ? c.statoPiattaforma === "ENABLED"
          : c?.stato === "attiva" || c?.stato === "in_apprendimento",
      };
    });
    campagne.sort((x, y) => Number(y.viva) - Number(x.viva) || x.nome.localeCompare(y.nome, "it"));

    // Il brand è un fatto se le campagne lo dicono, e concordano.
    const brandsVisti = [...new Set(campagne.map((c) => c.brand).filter((b) => b && b !== "cross"))];
    const brand = brandsVisti.length === 1 ? brandsVisti[0] : brandsVisti.length > 1 ? "cross" : brandDaDominio(url);

    fuori.push({
      url,
      urlIntera: a.urlIntera,
      annunci: a.annunci,
      sitelink: a.sitelink,
      spesaAnnunci: a.conSpesa ? Math.round(a.spesa * 100) / 100 : null,
      campagne,
      campagneVive: campagne.filter((c) => c.viva).length,
      brand,
      brandDedotto: brandsVisti.length === 0,
      lingua: linguaDaUrl(url),
      giaRegistrata: giaRegistrate.has(url),
    });
  }

  // L'ordine è la priorità: prima quelle dove gira una campagna adesso, poi
  // per spesa, poi per quanti annunci ci mandano. Una pagina su cui non
  // spende più nessuno può aspettare.
  fuori.sort(
    (a, b) =>
      Number(b.campagneVive > 0) - Number(a.campagneVive > 0) ||
      (b.spesaAnnunci ?? 0) - (a.spesaAnnunci ?? 0) ||
      b.annunci + b.sitelink - (a.annunci + a.sitelink) ||
      a.url.localeCompare(b.url)
  );
  return fuori;
}
