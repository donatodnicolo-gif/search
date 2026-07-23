// Come sta andando una campagna, in una parola: dallo stato più i numeri.
// Le soglie ricalcano il linguaggio dei Definitivi (ROAS target 4, break-even
// intorno a 2): sopra target "performa", sotto break-even "critica".

export type Salute = { etichetta: string; colore: string; spiega: string };

export function saluteCampagna(
  stato: string,
  roas: number | null,
  spesa: number
): Salute {
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
  if (roas >= 4) {
    return { etichetta: "Performa", colore: "var(--green)", spiega: `ROAS ${roas.toFixed(1)}× sopra il target di 4×` };
  }
  if (roas >= 2) {
    return { etichetta: "Nella media", colore: "var(--blue)", spiega: `ROAS ${roas.toFixed(1)}×: sopra il break-even ma sotto il target` };
  }
  return { etichetta: "Critica", colore: "var(--red)", spiega: `ROAS ${roas.toFixed(1)}× sotto il break-even` };
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
