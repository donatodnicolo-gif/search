// Come sta andando una campagna, in una parola: dallo stato più i numeri.
// Le soglie sono parametriche per brand (doc 10 §11: break-even = 1/margine):
// Gifts BE 3,3 · Flowers BE 2,5 · Cake BE 2,0. Target = 1,5× il break-even.
import { breakEvenRoas } from "./guardrail";

export type Salute = { etichetta: string; colore: string; spiega: string };

export function saluteCampagna(
  stato: string,
  roas: number | null,
  spesa: number,
  brand: string = "cross"
): Salute {
  const be = breakEvenRoas(brand);
  const target = be * 1.5;
  if (stato === "in_apprendimento") {
    return {
      etichetta: "In apprendimento",
      colore: "var(--gold-strong)",
      spiega: "Finestra di apprendimento: non toccare per 7-14 giorni",
    };
  }
  if (stato === "in_pausa") {
    return { etichetta: "In pausa", colore: "var(--ardesia)", spiega: "Non sta spendendo: ferma per scelta, non in allarme" };
  }
  if (stato === "conclusa") {
    return { etichetta: "Conclusa", colore: "var(--text-secondary)", spiega: "Campagna chiusa" };
  }
  if (stato === "bozza") {
    return { etichetta: "Bozza", colore: "var(--text-tertiary)", spiega: "Non ancora lanciata" };
  }
  // Attiva: giudizio dai numeri
  if (roas == null || spesa <= 0) {
    return {
      etichetta: "Senza dati",
      colore: "var(--text-tertiary)",
      spiega: "Attiva ma senza metriche registrate negli ultimi 30 giorni",
    };
  }
  if (roas >= target) {
    return { etichetta: "Performa", colore: "var(--green)", spiega: `ROAS ${roas.toFixed(1).replace(".", ",")}× sopra il target del brand (${target.toFixed(1).replace(".", ",")}× = 1,5× break-even)` };
  }
  if (roas >= be) {
    return { etichetta: "Nella media", colore: "var(--blue)", spiega: `ROAS ${roas.toFixed(1).replace(".", ",")}×: sopra il break-even del brand (${be.toFixed(1).replace(".", ",")}×) ma sotto il target (${target.toFixed(1).replace(".", ",")}×)` };
  }
  return { etichetta: "Critica", colore: "var(--red)", spiega: `ROAS ${roas.toFixed(1).replace(".", ",")}× sotto il break-even del brand (${be.toFixed(1).replace(".", ",")}× = 1/margine, doc 10 §11)` };
}

// Categoria merceologica dedotta da nome campagna e landing → icona a tema.
export function categoriaCampagna(testo: string): { icona: string; nome: string } {
  const t = testo.toLowerCase();
  if (/tort|cake/.test(t)) return { icona: "torta", nome: "Torte" };
  if (/colazion|breakfast/.test(t)) return { icona: "colazione", nome: "Colazioni" };
  if (/palloncin|balloon/.test(t)) return { icona: "palloncino", nome: "Palloncini" };
  if (/catering|b2b|aziendal|corporate|business/.test(t)) return { icona: "b2b", nome: "B2B" };
  if (/event|allestiment|matrimon|lead/.test(t)) return { icona: "eventi", nome: "Eventi" };
  if (/brand ?protection|brand protection/.test(t)) return { icona: "audit", nome: "Brand" };
  if (/regal|gift/.test(t)) return { icona: "regalo", nome: "Regali" };
  if (/paris|francia|destination|opera/.test(t)) return { icona: "destinazioni", nome: "Estero" };
  if (/fior|flower|rose|bouquet|deluxyflower/.test(t)) return { icona: "fiori", nome: "Fiori" };
  return { icona: "pagina", nome: "Generica" };
}

export function iconaCanale(canale: string): string {
  if (canale === "meta_ads") return "metaads";
  if (canale === "google_ads") return "google";
  if (canale === "tiktok") return "tiktok";
  return "campagne";
}

// ---------- Valutazione automatica di una keyword ----------
// Giudizio dai numeri, secondo le soglie della pratica search advertising:
// il break-even di Deluxy sta intorno a 2× (margine ~50%), il target è 4×.
// Sotto i 20 € di spesa non c'è statistica: si dichiara, non si giudica.

export type GiudizioKeyword = {
  etichetta: string;
  colore: string;
  spiega: string;
  // stato consigliato: la pillola che l'app propone di applicare
  consiglio: "vincente" | "attiva" | "da_valutare" | "in_pausa" | "esclusa";
};

/**
 * Sotto quanta spesa non c'è abbastanza statistica per dare un verdetto.
 * Con due o tre clic non si decide niente: quello è rumore, non un giudizio.
 */
export const SOGLIA_GIUDIZIO_EUR = 20;

/**
 * «Spende a vuoto»: ha speso abbastanza da contare, e non è entrato NIENTE.
 *
 * ⚠️⚠️ UNA DEFINIZIONE SOLA (08/09/2026). Prima ce n'erano due, con la stessa
 * etichetta a schermo: la scheda campagna diceva `spesa > 0 && conversioni === 0
 * && incasso === 0` (nessuna soglia: bastavano 40 centesimi per finire
 * nell'elenco delle colpevoli) e la scheda gruppo diceva `spesa >= 20 &&
 * incasso === 0` (senza guardare le conversioni). Due bilance che pesano la
 * stessa mela e dicono numeri diversi. Si tengono le due cose giuste di
 * ciascuna: la SOGLIA della versione gruppo e il fatto che debbano essere
 * vuote TUTTE E DUE della versione campagna.
 *
 * ⚠️ Perché servono tutte e due le condizioni: le righe che arrivano dal
 * Monitoraggio portano l'incasso ma NON il numero di conversioni. Con la sola
 * regola «conversioni = 0» una keyword che ha reso 3.817 € finiva fra quelle
 * che non hanno portato niente. Un dato che manca non è uno zero.
 */
export function spendeAVuoto(
  spesa: number | null | undefined,
  conversioni: number | null | undefined,
  incasso: number | null | undefined
): boolean {
  if ((spesa ?? 0) < SOGLIA_GIUDIZIO_EUR) return false;
  if ((incasso ?? 0) !== 0) return false;
  // ⚠️ `null` vuol dire «il conteggio non ce l'ho», e un dato che manca non è
  // uno zero: in quel caso decide il solo incasso, come faceva la scheda
  // gruppo. Se invece il numero c'è, dev'essere zero: una conversione senza
  // incasso è comunque qualcosa che è successo, e non si chiama «a vuoto».
  if (conversioni == null) return true;
  return conversioni === 0;
}

// ⚠️⚠️ IL METRO È IL BREAK-EVEN DEL BRAND, NON 4× PER TUTTI (08/09/2026).
// Le soglie erano fisse — 1 / 2 / 4 / 8 — e corrispondono al break-even di
// Cake (margine 50% → 2,0). Su Gifts (margine 30% → break-even 3,33) una
// keyword a 2,5× è SOTTO il pareggio e questa scala la chiamava «Nella media»,
// in blu: un semaforo verde su una parola che perde soldi. Peggio ancora, nella
// stessa pagina del gruppo la colonna «Resa» dei termini era già colorata col
// break-even di brand: due metri diversi a due righe di distanza.
// Le soglie restano le stesse RELATIVE al pareggio (0,5× · 1× · 2× · 4× del
// break-even), così su Cake non cambia niente e sugli altri brand smette di
// mentire. `breakEven` ha un default di 2 per i chiamanti che non conoscono il
// brand: è il valore che la scala aveva prima, quindi nessuno peggiora.
export function giudizioKeyword(incasso: number, spesa: number, breakEven = 2): GiudizioKeyword {
  const resa = spesa > 0 ? incasso / spesa : null;
  const be = breakEven > 0 ? breakEven : 2;
  const x = (n: number) => `${n.toFixed(1).replace(".", ",")}×`;

  if (spesa < 20 && incasso === 0) {
    return {
      etichetta: "Poco traffico",
      colore: "var(--text-tertiary)",
      spiega: "Sotto i 20 € di spesa non c'è abbastanza statistica per giudicare: lasciare correre e riguardare tra qualche settimana.",
      consiglio: "attiva",
    };
  }
  if (incasso === 0) {
    return {
      etichetta: "Spende a vuoto",
      colore: "var(--red)",
      spiega: `${spesa.toFixed(0)} € spesi e zero incasso: intento sbagliato o pagina non pertinente. Da escludere o riscrivere l'annuncio.`,
      consiglio: spesa >= 100 ? "esclusa" : "in_pausa",
    };
  }
  if (resa == null) {
    return {
      etichetta: "Da verificare",
      colore: "var(--text-tertiary)",
      spiega: "Incasso registrato senza spesa: dato incompleto, va verificato in piattaforma.",
      consiglio: "da_valutare",
    };
  }
  if (resa >= be * 4) {
    return {
      etichetta: "Da scalare",
      colore: "var(--green)",
      spiega: `Resa ${x(resa)}, molto sopra il pareggio di ${x(be)}: alzare le offerte e presidiare la quota impressioni, è qui che c'è margine da prendere.`,
      consiglio: "vincente",
    };
  }
  if (resa >= be * 2) {
    return {
      etichetta: "Buona",
      colore: "var(--green)",
      spiega: `Resa ${x(resa)}: sopra il target di ${x(be * 2)}. Tenerla attiva e proteggerla dalle variazioni di budget.`,
      consiglio: "vincente",
    };
  }
  if (resa >= be) {
    return {
      etichetta: "Nella media",
      colore: "var(--blue)",
      spiega: `Resa ${x(resa)}: sopra il break-even di ${x(be)} ma sotto il target. Migliorare pertinenza dell'annuncio e landing prima di toccare le offerte.`,
      consiglio: "attiva",
    };
  }
  if (resa >= be / 2) {
    return {
      etichetta: "Marginale",
      colore: "var(--orange)",
      spiega: `Resa ${x(resa)}: sotto il pareggio di ${x(be)}, non produce margine. Abbassare le offerte, restringere la corrispondenza o mettere in pausa.`,
      consiglio: "da_valutare",
    };
  }
  return {
    etichetta: "In perdita",
    colore: "var(--red)",
    spiega: `Resa ${x(resa)}, contro un pareggio di ${x(be)}: incassa molto meno di quanto costa. Va fermata, salvo che serva come ricerca di volume dichiarata.`,
    consiglio: spesa >= 100 ? "esclusa" : "in_pausa",
  };
}
