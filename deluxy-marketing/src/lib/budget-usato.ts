// Quanto del budget giornaliero una campagna sta davvero usando.
//
// La domanda vera non è "quanto ha speso" — quello è già un KPI — ma "sta
// riempiendo il budget che le abbiamo dato, o ne lascia sul tavolo?". Sono due
// letture opposte: una campagna al tetto è limitata dai soldi (alzarli porta
// volume), una al 40% è limitata da altro (domanda, offerte, qualità) e
// alzarle il budget non cambierebbe niente.
//
// ⚠️ TRE SCELTE CHE CAMBIANO IL NUMERO, e vanno dichiarate a chi legge:
//
// 1. OGGI NON CONTA. Il giorno in corso è mezzo giorno: metterlo dentro
//    abbasserebbe la percentuale di tutte le campagne, ogni mattina, e a
//    mezzogiorno «48%» sembrerebbe un problema quando è solo l'ora. È la
//    stessa ragione per cui OggiCampagna tiene il giorno in corso separato.
//
// 2. SI DIVIDE PER I GIORNI IN CUI HA EROGATO, non per i giorni del periodo.
//    Una campagna accesa 3 giorni su 7, che in quei 3 ha finito il budget,
//    ha usato il 100% di quello che poteva — non il 43%. Dividere per il
//    calendario la farebbe sembrare in risparmio proprio mentre è al tetto,
//    che è la conclusione opposta a quella giusta.
//
// 3. SENZA BUDGET NON SI RISPONDE. Budget assente o zero → `null`, e chi
//    mostra scrive «—». Vale spesso su Meta, dove il budget può stare
//    sull'ad set (CBO) e non sulla campagna: lì non è «zero», è «non lo so».

export type UsoBudget = {
  /** 1 = ha usato esattamente il budget; 0,4 = ne ha usato il 40%. */
  quota: number;
  /** Giorni davvero contati (erogati e conclusi). */
  giorni: number;
  mediaGiornaliera: number;
  budgetGiornaliero: number;
  /** Vero se il giorno in corso è stato tolto dal conto. */
  oggiEscluso: boolean;
  /** Frase pronta per il title: dice esattamente cosa è stato calcolato. */
  spiega: string;
};

const GIORNO = 86_400_000;

function mezzanotte(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function euro(n: number): string {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}

/**
 * `metriche` sono le righe giorno×campagna già filtrate sul periodo.
 * Restituisce `null` quando la domanda non ha risposta (niente budget, oppure
 * nessun giorno concluso con dati): un «0%» inventato è peggio di un trattino.
 */
export function usoBudget(
  metriche: { data: Date; spesa: number | null }[],
  budgetGiornaliero: number | null,
  adesso?: Date
): UsoBudget | null {
  if (budgetGiornaliero == null || budgetGiornaliero <= 0) return null;

  const oggi = mezzanotte(adesso ?? new Date());

  // Un giorno per data: se per qualsiasi ragione arrivassero due righe per lo
  // stesso giorno, il denominatore non deve contarlo due volte.
  const perGiorno = new Map<number, number>();
  let oggiVisto = false;
  for (const m of metriche) {
    const g = mezzanotte(m.data).getTime();
    if (g >= oggi.getTime()) {
      // Oggi (o, con date libere che sforano, il futuro): fuori dal conto.
      if (g === oggi.getTime()) oggiVisto = true;
      continue;
    }
    perGiorno.set(g, (perGiorno.get(g) ?? 0) + (m.spesa ?? 0));
  }

  const giorni = perGiorno.size;
  if (giorni === 0) return null;

  let spesa = 0;
  for (const v of perGiorno.values()) spesa += v;
  const mediaGiornaliera = spesa / giorni;
  const quota = mediaGiornaliera / budgetGiornaliero;

  const spiega =
    `${euro(mediaGiornaliera)} al giorno di media su ${giorni} giorn${giorni === 1 ? "o" : "i"} ` +
    `di erogazione, contro un budget di ${euro(budgetGiornaliero)}/g` +
    (oggiVisto ? ". Oggi è escluso: è un giorno ancora in corso" : "") +
    (giorni === 1 ? ". Un solo giorno: è un indizio, non una media" : "");

  return { quota, giorni, mediaGiornaliera, budgetGiornaliero, oggiEscluso: oggiVisto, spiega };
}

/**
 * Come leggere la quota. Il colore si accende solo dove c'è una DECISIONE da
 * prendere: al tetto (alzare il budget porterebbe volume) o molto sotto (il
 * freno non sono i soldi, e alzarli non servirebbe a niente). In mezzo è
 * normale e resta grigio, perché colorare tutto equivale a non colorare nulla.
 */
export function letturaBudget(u: UsoBudget): { etichetta: string; colore?: string; nota: string } {
  if (u.quota >= 0.95) {
    return {
      etichetta: "al tetto",
      colore: "var(--orange)",
      nota: "Spende tutto il budget: è il budget a limitarla, non la domanda. Alzarlo porterebbe altro volume.",
    };
  }
  if (u.quota < 0.5) {
    return {
      etichetta: "molto sotto",
      colore: "var(--blue)",
      nota: "Usa meno di metà del budget: il freno non sono i soldi (domanda, offerte o qualità). Alzare il budget non cambierebbe niente.",
    };
  }
  return { etichetta: "nella norma", nota: "Usa buona parte del budget senza arrivare al tetto." };
}

/** «83%» — arrotondato all'unità: la falsa precisione qui non serve a nessuno. */
export function formattaQuota(u: UsoBudget): string {
  return `${Math.round(u.quota * 100)}%`;
}
