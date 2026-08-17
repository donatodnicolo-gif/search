// Costi ricorrenti — le controparti che tornano mese dopo mese.
//
// Perché esiste: fra 1.700 controparti l'occhio va alle più grosse, e le più
// grosse sono quasi tutte partner e stipendi. I risparmi però stanno altrove:
// nel canone da 60 € che nessuno ricorda di aver sottoscritto, nel software che
// si paga due volte, nel noleggio finito da mesi che addebita ancora. Sono
// piccoli uno per uno e si vedono solo mettendoli in fila per **regolarità**,
// non per importo. Questo modulo li mette in fila; decidere se tagliarli è un
// lavoro da persone.
//
// Lavora sui numeri che il CFO ha già: le uscite per controparte e per mese
// che arrivano da Finance, dopo `ricostruisci()` — così la categoria e la voce
// di P&L sono le stesse che si vedono nel resto della pagina, e la stessa
// controparte divisa su più categorie (PayPal: banca, partner, consegne) si
// **ricompone** in una riga sola: la domanda qui è «chi paghiamo ogni mese»,
// non «in quale casella».
import type { RigaCategoria } from "./cfo";

export type CostoRicorrente = {
  controparte: string;
  // Le categorie in cui la controparte è divisa, con l'importo di ciascuna,
  // dalla più pesante. `categoriaNome`/`tipoPL` sono quelli della più pesante:
  // una riga deve avere un colore solo, e il resto si legge nel dettaglio.
  categorie: { id: string | null; nome: string | null; tipoPL: string | null; uscite: number }[];
  categoriaNome: string | null;
  tipoPL: string | null; // null = non categorizzata
  perMese: number[]; // dodici mesi, sommati su tutte le categorie
  uscite: number; // nel periodo (mesi chiusi + mese aperto)
  movimenti: number;
  // Su quanti mesi **chiusi** del periodo la controparte compare, e quanti sono.
  // Il mese in corso non conta né a favore né contro: a metà agosto un canone
  // «assente ad agosto» è solo un canone che non è ancora passato.
  mesiAttivi: number;
  mesiChiusi: number;
  primoMese: number; // 1..12, primo mese con uscite (anche aperto)
  ultimoMese: number; // 1..12, ultimo mese con uscite (anche aperto)
  // La cifra tipica di un mese: media dei soli mesi chiusi in cui c'è stata.
  mediaMese: number;
  minMese: number;
  maxMese: number;
  // Quanto oscilla da un mese all'altro (deviazione standard ÷ media, sui mesi
  // attivi chiusi). Sotto il 15% è **un canone**: stessa cifra ogni mese.
  cv: number;
  regolarita: "fisso" | "regolare" | "variabile";
  frequenza: "ogni-mese" | "quasi-ogni-mese" | "frequente";
  // «forse cessato» = niente da almeno due mesi chiusi né nel mese aperto. Può
  // voler dire disdetto — o che si paga in un altro modo (PayPal, altra carta):
  // in entrambi i casi è una cosa da sapere.
  stato: "attivo" | "forse-cessato";
  // Quanto costa in un anno **a questo ritmo**: uscite dei mesi chiusi ÷ mesi
  // chiusi × 12. È il numero che fa decidere — 60 € al mese sembrano niente,
  // 720 € l'anno no. Per un ricorrente «forse cessato» non si proietta: se
  // davvero è finito, ha smesso di costare.
  annuoAQuestoRitmo: number | null;
};

export type Ricorrenti = {
  voci: CostoRicorrente[];
  mesiChiusi: number; // quanti mesi chiusi ha il periodo
  meseAperto: number | null; // il mese in corso, se cade nel periodo
  ultimoChiuso: number | null; // l'ultimo mese chiuso del periodo (1..12)
  // Le soglie, dichiarate: la pagina le scrive, così chi legge sa cosa NON
  // vede e non prende «non c'è» per «non esiste».
  soglie: typeof SOGLIE;
};

export const SOGLIE = {
  MIN_MESI: 3, // sotto è una coincidenza, non un'abitudine
  QUOTA_MESI: 0.5, // presente in almeno metà dei mesi chiusi…
  ULTIMI_DI_FILA: 3, // …oppure negli ultimi N mesi chiusi consecutivi (è appena cominciato)
  CV_FISSO: 0.15, // sotto: canone, stessa cifra ogni mese
  CV_REGOLARE: 0.5, // sotto: regolare; sopra: variabile
  MESI_SILENZIO: 2, // chiusi senza uscite (e niente nel mese aperto) → «forse cessato»
  BRICIOLE: 0.5, // sotto mezzo euro un mese non conta come «attivo»
} as const;

/**
 * Trova i costi ricorrenti fra le controparti del CFO.
 *
 * @param righe   l'uscita di `ricostruisci()`
 * @param dal/al  il periodo scelto nella pagina (mesi 1..12)
 * @param annoInCorso/meseInCorso  per sapere quali mesi sono chiusi. Un anno
 *        passato ha dodici mesi chiusi; l'anno in corso li ha fino al mese
 *        prima di questo; un anno futuro nessuno.
 */
export function trovaRicorrenti(
  righe: RigaCategoria[],
  opts: {
    anno: number;
    dal: number;
    al: number;
    annoInCorso: number;
    meseInCorso: number;
    // Movimenti per controparte, dall'elenco grezzo di Finance: i pezzi per
    // categoria non li portano. Serve a distinguere «un addebito al mese» (un
    // canone) da «159 addebiti» (commissioni, carte, POS).
    movimenti?: Map<string, number>;
  }
): Ricorrenti {
  const { anno, dal, al, annoInCorso, meseInCorso } = opts;
  const limiteChiuso = anno < annoInCorso ? 12 : anno > annoInCorso ? 0 : meseInCorso - 1;
  const mesiChiusiIdx: number[] = []; // 0-based
  for (let m = dal; m <= Math.min(al, limiteChiuso); m++) mesiChiusiIdx.push(m - 1);
  const meseAperto = anno === annoInCorso && meseInCorso >= dal && meseInCorso <= al ? meseInCorso : null;
  const ultimoChiuso = mesiChiusiIdx.length ? mesiChiusiIdx[mesiChiusiIdx.length - 1] + 1 : null;

  // 1) Ricomponi ogni controparte dai pezzi delle categorie.
  type Acc = {
    perMese: number[];
    uscite: number;
    movimenti: number;
    categorie: CostoRicorrente["categorie"];
  };
  const perContro = new Map<string, Acc>();
  for (const r of righe) {
    for (const c of r.controparti) {
      const acc: Acc =
        perContro.get(c.controparte) ?? { perMese: Array(12).fill(0), uscite: 0, movimenti: 0, categorie: [] };
      for (let i = 0; i < 12; i++) acc.perMese[i] += c.perMese[i] ?? 0;
      acc.uscite += c.uscite;
      acc.categorie.push({
        id: r.categoria?.id ?? null,
        nome: r.categoria?.nome ?? null,
        tipoPL: r.categoria?.tipoPL ?? null,
        uscite: c.uscite,
      });
      perContro.set(c.controparte, acc);
    }
  }
  for (const [nome, acc] of perContro) acc.movimenti = opts.movimenti?.get(nome) ?? 0;

  const voci: CostoRicorrente[] = [];
  if (mesiChiusiIdx.length < SOGLIE.MIN_MESI) {
    return { voci, mesiChiusi: mesiChiusiIdx.length, meseAperto, ultimoChiuso, soglie: SOGLIE };
  }

  for (const [controparte, acc] of perContro) {
    const attiviIdx = mesiChiusiIdx.filter((i) => acc.perMese[i] > SOGLIE.BRICIOLE);
    const mesiAttivi = attiviIdx.length;
    if (mesiAttivi < SOGLIE.MIN_MESI) continue;

    // 2) È ricorrente? In almeno metà dei mesi chiusi, oppure negli ultimi N
    //    chiusi tutti di fila (un canone partito a maggio, a luglio ha tre mesi
    //    e merita di stare in lista anche se sono 3 su 7).
    const quota = mesiAttivi / mesiChiusiIdx.length;
    const ultimiN = mesiChiusiIdx.slice(-SOGLIE.ULTIMI_DI_FILA);
    const ultimiDiFila = ultimiN.length === SOGLIE.ULTIMI_DI_FILA && ultimiN.every((i) => acc.perMese[i] > SOGLIE.BRICIOLE);
    if (quota < SOGLIE.QUOTA_MESI && !ultimiDiFila) continue;

    // 3) La cifra tipica e quanto balla.
    const importi = attiviIdx.map((i) => acc.perMese[i]);
    const media = importi.reduce((s, v) => s + v, 0) / importi.length;
    const sd = Math.sqrt(importi.reduce((s, v) => s + (v - media) ** 2, 0) / importi.length);
    const cv = media > 0 ? sd / media : 0;
    const regolarita: CostoRicorrente["regolarita"] =
      cv < SOGLIE.CV_FISSO ? "fisso" : cv < SOGLIE.CV_REGOLARE ? "regolare" : "variabile";
    const frequenza: CostoRicorrente["frequenza"] =
      mesiAttivi === mesiChiusiIdx.length ? "ogni-mese" : quota >= 0.75 ? "quasi-ogni-mese" : "frequente";

    // 4) È ancora vivo? Primo e ultimo mese con uscite, mese aperto compreso.
    let primo = -1;
    let ultimo = -1;
    for (let i = 0; i < 12; i++) {
      if (acc.perMese[i] > SOGLIE.BRICIOLE) {
        if (primo < 0) primo = i;
        ultimo = i;
      }
    }
    const nelMeseAperto = meseAperto ? acc.perMese[meseAperto - 1] > SOGLIE.BRICIOLE : false;
    const silenzio = ultimoChiuso ? ultimoChiuso - (ultimo + 1) : 0; // mesi chiusi senza uscite, dopo l'ultima
    const stato: CostoRicorrente["stato"] =
      !nelMeseAperto && silenzio >= SOGLIE.MESI_SILENZIO ? "forse-cessato" : "attivo";

    // 5) Quanto costa in un anno, a questo ritmo (solo mesi chiusi: il mese
    //    aperto sporcherebbe la media verso il basso).
    const usciteChiuse = mesiChiusiIdx.reduce((s, i) => s + acc.perMese[i], 0);
    const annuo = stato === "attivo" ? (usciteChiuse / mesiChiusiIdx.length) * 12 : null;

    const categorie = [...acc.categorie].sort((a, b) => b.uscite - a.uscite);
    voci.push({
      controparte,
      categorie,
      categoriaNome: categorie[0]?.nome ?? null,
      tipoPL: categorie[0]?.tipoPL ?? null,
      perMese: acc.perMese,
      uscite: acc.uscite,
      movimenti: acc.movimenti,
      mesiAttivi,
      mesiChiusi: mesiChiusiIdx.length,
      primoMese: primo + 1,
      ultimoMese: ultimo + 1,
      mediaMese: media,
      minMese: Math.min(...importi),
      maxMese: Math.max(...importi),
      cv,
      regolarita,
      frequenza,
      stato,
      annuoAQuestoRitmo: annuo,
    });
  }

  // Dal più pesante all'anno; i «forse cessati» in coda, per media.
  voci.sort((a, b) => {
    const pa = a.annuoAQuestoRitmo ?? -1;
    const pb = b.annuoAQuestoRitmo ?? -1;
    if (pa !== pb) return pb - pa;
    return b.mediaMese - a.mediaMese;
  });

  return { voci, mesiChiusi: mesiChiusiIdx.length, meseAperto, ultimoChiuso, soglie: SOGLIE };
}
