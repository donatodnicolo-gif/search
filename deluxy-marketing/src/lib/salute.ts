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
    return { etichetta: "In pausa", colore: "var(--orange)", spiega: "Non sta spendendo" };
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
    return { etichetta: "Performa", colore: "var(--green)", spiega: `ROAS ${roas.toFixed(1)}× sopra il target del brand (${target.toFixed(1)}× = 1,5× break-even)` };
  }
  if (roas >= be) {
    return { etichetta: "Nella media", colore: "var(--blue)", spiega: `ROAS ${roas.toFixed(1)}×: sopra il break-even del brand (${be.toFixed(1)}×) ma sotto il target (${target.toFixed(1)}×)` };
  }
  return { etichetta: "Critica", colore: "var(--red)", spiega: `ROAS ${roas.toFixed(1)}× sotto il break-even del brand (${be.toFixed(1)}× = 1/margine, doc 10 §11)` };
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

export function giudizioKeyword(incasso: number, spesa: number): GiudizioKeyword {
  const resa = spesa > 0 ? incasso / spesa : null;

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
  if (resa >= 8) {
    return {
      etichetta: "Da scalare",
      colore: "var(--green)",
      spiega: `Resa ${resa.toFixed(1)}×, molto sopra il target di 4×: alzare le offerte e presidiare la quota impressioni, è qui che c'è margine da prendere.`,
      consiglio: "vincente",
    };
  }
  if (resa >= 4) {
    return {
      etichetta: "Buona",
      colore: "var(--green)",
      spiega: `Resa ${resa.toFixed(1)}×: sopra il target di 4×. Tenerla attiva e proteggerla dalle variazioni di budget.`,
      consiglio: "vincente",
    };
  }
  if (resa >= 2) {
    return {
      etichetta: "Nella media",
      colore: "var(--blue)",
      spiega: `Resa ${resa.toFixed(1)}×: sopra il break-even ma sotto il target. Migliorare pertinenza dell'annuncio e landing prima di toccare le offerte.`,
      consiglio: "attiva",
    };
  }
  if (resa >= 1) {
    return {
      etichetta: "Marginale",
      colore: "var(--orange)",
      spiega: `Resa ${resa.toFixed(1)}×: intorno al pareggio, non produce margine. Abbassare le offerte, restringere la corrispondenza o mettere in pausa.`,
      consiglio: "da_valutare",
    };
  }
  return {
    etichetta: "In perdita",
    colore: "var(--red)",
    spiega: `Resa ${resa.toFixed(1)}×: incassa meno di quanto costa. Va fermata, salvo che serva come ricerca di volume dichiarata.`,
    consiglio: spesa >= 100 ? "esclusa" : "in_pausa",
  };
}
