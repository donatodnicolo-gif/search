// Le regole numeriche dei Definitivi, tradotte in funzioni.
// Fonti: doc 4 (setup), doc 8.1 (apprendimento Meta), doc 10 (metodologia,
// pacing, se/allora), doc 11 (traino, livelli L0-L3, alert A1-A5), 00.3/00.5.

export type MetricaGiorno = {
  data: Date;
  spesa: number | null;
  impression: number | null;
  click: number | null;
  conversioni: number | null;
  ricavi: number | null;
};

// ---------- Break-even ROAS per brand (doc 10 §11: BE = 1/margine) ----------
// Valori dai documenti: Gifts margine 30% → BE 3,33 · Flowers BE 2,5 ·
// Cake margine ~50% → BE 2,0. Il target resta 1,5× il break-even.
export const MARGINE_BRAND: Record<string, number> = {
  gifts: 0.3,
  flowers: 0.4,
  cake: 0.5,
  cross: 0.35,
};

export function breakEvenRoas(brand: string): number {
  const margine = MARGINE_BRAND[brand] ?? 0.35;
  return 1 / margine;
}

// ROAS di piattaforma "scontato" verso il reale (doc 10 §3: le piattaforme
// sovrastimano 1,3-1,6× vs GA4/backend → reale ≈ 60-75% del dichiarato).
export function roasRealeStimato(roasPiattaforma: number): { min: number; max: number } {
  return { min: roasPiattaforma * 0.6, max: roasPiattaforma * 0.75 };
}

// ---------- Classe TRAINO (doc 11 §1) ----------
// TRAINO se ≥25% del valore conversioni dell'account, oppure ROAS ≥ 1,5× BE
// con ≥15% della spesa account (su 30 giorni).
export function candidataTraino(
  brand: string,
  ricavi30: number,
  spesa30: number,
  ricaviAccount30: number,
  spesaAccount30: number
): { candidata: boolean; motivo: string | null } {
  if (ricaviAccount30 > 0 && ricavi30 / ricaviAccount30 >= 0.25) {
    return { candidata: true, motivo: `genera il ${Math.round((ricavi30 / ricaviAccount30) * 100)}% del valore dell'account (soglia 25%)` };
  }
  const roas = spesa30 > 0 ? ricavi30 / spesa30 : null;
  const quotaSpesa = spesaAccount30 > 0 ? spesa30 / spesaAccount30 : 0;
  if (roas != null && roas >= 1.5 * breakEvenRoas(brand) && quotaSpesa >= 0.15) {
    return { candidata: true, motivo: `ROAS ${roas.toFixed(1)}× ≥ 1,5× break-even con il ${Math.round(quotaSpesa * 100)}% della spesa (soglia 15%)` };
  }
  return { candidata: false, motivo: null };
}

// ---------- Alert A1-A5 (doc 11 §4) ----------
export type AlertRilevato = { tipo: string; livello: "rosso" | "arancio" | "giallo"; messaggio: string };

const somma = (m: MetricaGiorno[], campo: keyof MetricaGiorno) =>
  m.reduce((s, r) => s + ((r[campo] as number | null) ?? 0), 0);

// metriche ordinate per data crescente; traino cambia le soglie A1.
export function valutaAlert(metriche: MetricaGiorno[], traino: boolean): AlertRilevato[] {
  const esiti: AlertRilevato[] = [];
  if (metriche.length < 3) return esiti;
  const ultime48 = metriche.slice(-2);
  const ultimi3 = metriche.slice(-3);
  const ultimi7 = metriche.slice(-7);
  const precedenti7 = metriche.slice(-14, -7);
  const ultimi30 = metriche.slice(-30);

  // A1 — acquisto muto: spesa ≥25 € e 0 conversioni nelle ultime 48h (traino)
  const spesa48 = somma(ultime48, "spesa");
  const conv48 = somma(ultime48, "conversioni");
  if (traino && spesa48 >= 25 && conv48 === 0) {
    esiti.push({ tipo: "A1", livello: "rosso", messaggio: `Acquisto muto: ${spesa48.toFixed(0)} € spesi e 0 conversioni nelle ultime 48h` });
  }

  // A2 — erogazione: impressioni o clic −50% vs media 7gg precedente
  if (precedenti7.length >= 4) {
    const imprOra = somma(ultimi3, "impression") / ultimi3.length;
    const imprPrima = somma(precedenti7, "impression") / precedenti7.length;
    const clicOra = somma(ultimi3, "click") / ultimi3.length;
    const clicPrima = somma(precedenti7, "click") / precedenti7.length;
    if ((imprPrima > 0 && imprOra <= imprPrima * 0.5) || (clicPrima > 0 && clicOra <= clicPrima * 0.5)) {
      esiti.push({ tipo: "A2", livello: "rosso", messaggio: "Erogazione crollata: impressioni o clic a −50% rispetto alla media dei 7 giorni" });
    }
  }

  // A3 — redditività: ROAS 3gg < 50% del ROAS 30gg (con spesa regolare)
  const spesa3 = somma(ultimi3, "spesa");
  const roas3 = spesa3 > 0 ? somma(ultimi3, "ricavi") / spesa3 : null;
  const spesa30 = somma(ultimi30, "spesa");
  const roas30 = spesa30 > 0 ? somma(ultimi30, "ricavi") / spesa30 : null;
  if (roas3 != null && roas30 != null && roas30 > 0 && spesa3 > 0 && roas3 < roas30 * 0.5) {
    esiti.push({ tipo: "A3", livello: "arancio", messaggio: `Redditività: ROAS 3gg ${roas3.toFixed(1)}× sotto la metà del ROAS 30gg (${roas30.toFixed(1)}×)` });
  }

  // A5 — segnali deboli: CTR −30% o CPM ×2 vs 7gg. Solo annotare (doc 11:
  // "vietato reagire d'impulso").
  if (precedenti7.length >= 4) {
    const ctrOra = somma(ultimi3, "impression") > 0 ? somma(ultimi3, "click") / somma(ultimi3, "impression") : null;
    const ctrPrima = somma(precedenti7, "impression") > 0 ? somma(precedenti7, "click") / somma(precedenti7, "impression") : null;
    const cpmOra = somma(ultimi3, "impression") > 0 ? (somma(ultimi3, "spesa") / somma(ultimi3, "impression")) * 1000 : null;
    const cpmPrima = somma(precedenti7, "impression") > 0 ? (somma(precedenti7, "spesa") / somma(precedenti7, "impression")) * 1000 : null;
    const segnali: string[] = [];
    if (ctrOra != null && ctrPrima != null && ctrPrima > 0 && ctrOra <= ctrPrima * 0.7) segnali.push("CTR −30%");
    if (cpmOra != null && cpmPrima != null && cpmPrima > 0 && cpmOra >= cpmPrima * 2) segnali.push("CPM raddoppiato");
    if (segnali.length > 0) {
      esiti.push({ tipo: "A5", livello: "giallo", messaggio: `Segnali deboli (${segnali.join(" · ")}): solo annotare, vietato reagire d'impulso` });
    }
  }
  return esiti;
}

// ---------- Apprendimento (doc 8.1 §5.2, doc 4) ----------
// eventi/settimana = (budget × 7) / costo evento · uscita ≈ 50 eventi/sett
// budget minimo per maturare = costo evento × 50 / 7
export function apprendimento(budgetGiorno: number | null, costoEvento: number | null) {
  if (!budgetGiorno || !costoEvento || costoEvento <= 0) return null;
  const eventiSettimana = (budgetGiorno * 7) / costoEvento;
  return {
    eventiSettimana,
    apprende: eventiSettimana >= 50,
    budgetMinimoGiorno: (costoEvento * 50) / 7,
  };
}

// Gate per il bidding automatico Google (doc 4 §2.2 e §3.2)
export function gateBidding(conv30: number, conValore: boolean) {
  return {
    tcpa: conv30 >= 30,
    tcpaIdeale: conv30 >= 50,
    troas: conValore && conv30 >= 15,
  };
}

// ---------- Pacing e regole se/allora (doc 10 §5-7) ----------
export type Pacing = {
  spesa7: number;
  atteso: number;
  rapporto: number | null; // spesa/atteso
  dentroBanda: boolean; // ±15%
};

export function pacing(metriche7: MetricaGiorno[], budgetGiorno: number | null): Pacing | null {
  if (!budgetGiorno || budgetGiorno <= 0) return null;
  const spesa7 = somma(metriche7, "spesa");
  const atteso = budgetGiorno * 7;
  const rapporto = atteso > 0 ? spesa7 / atteso : null;
  return { spesa7, atteso, rapporto, dentroBanda: rapporto != null && rapporto >= 0.85 && rapporto <= 1.15 };
}

// Le regole se/allora del checkpoint (doc 10 §7): propone, non esegue.
export function regoleSeAllora(
  metriche7: MetricaGiorno[],
  budgetGiorno: number | null,
  cpaTarget: number | null
): string[] {
  const proposte: string[] = [];
  if (!budgetGiorno || metriche7.length < 5) return proposte;
  const spesa7 = somma(metriche7, "spesa");
  const conv7 = somma(metriche7, "conversioni");
  const atteso = budgetGiorno * 7;
  const cpa7 = conv7 > 0 ? spesa7 / conv7 : null;

  if (cpaTarget && cpa7 != null) {
    if (spesa7 >= atteso * 0.9 && cpa7 <= cpaTarget * 1.15) {
      proposte.push(`Spesa ≥90% del budget e CPA ${cpa7.toFixed(0)} € entro target+15% → candidata ad aumento budget +25% (mai oltre +30%).`);
    }
    if (cpa7 > cpaTarget * 1.3) {
      proposte.push(`CPA ${cpa7.toFixed(0)} € oltre target+30%: se si ripete al prossimo checkpoint, allentare il tCPA di ~10%.`);
    }
  }
  const giorniSottoSpesa = metriche7.filter((m) => (m.spesa ?? 0) < budgetGiorno * 0.7).length;
  if (giorniSottoSpesa >= 5) {
    proposte.push(`Spesa sotto il 70% del budget per ${giorniSottoSpesa} giorni: fermare gli aumenti, cercare la causa (offerte, pubblici, approvazioni).`);
  }
  return proposte;
}

// ---------- Giudicabilità e change control (doc 10 §1.4, doc 11 §3) ----------
export const ORE_BLACKOUT = 72;

// ⚠️ Il blackout lo fa scattare una modifica che PESA — L1 e sopra. Una
// negativa puntuale è L0, "la modifica più leggera che esista", e non deve
// congelare la campagna per tre giorni: stava scritto nel commento di
// `escludiParoleSelezionate` ma nessuno lo diceva alla query, che pescava
// l'ultima modifica **di qualunque livello**. Risultato misurato il
// 04/08/2026 su "[Deluxy] - Fiori Milano ENG": una negativa delle 09:09
// bloccava ogni operazione successiva, cioè l'esatto contrario
// dell'intenzione dichiarata.
export const LIVELLI_CHE_PESANO = ["L1", "L2", "L3"];

// Da usare come `include: { modifiche: MODIFICHE_CHE_PESANO }`: tiene fuori le
// L0 alla fonte. Filtrarle DOPO non funzionerebbe — con `take: 1` la query ha
// già scartato la modifica vera che sta sotto la negativa.
export const MODIFICHE_CHE_PESANO = {
  where: { livello: { in: LIVELLI_CHE_PESANO } },
  orderBy: { eseguitaIl: "desc" as const },
  take: 1,
};

export function giudicabilita(ultimaModifica: Date | null): {
  stato: "giudicabile" | "blackout";
  fino: Date | null;
} {
  if (!ultimaModifica) return { stato: "giudicabile", fino: null };
  const fine = new Date(ultimaModifica.getTime() + ORE_BLACKOUT * 3600_000);
  return fine > new Date() ? { stato: "blackout", fino: fine } : { stato: "giudicabile", fino: null };
}

// Valida una nuova modifica prima di registrarla.
//
// ⚠️ **Dal 04/08/2026 il change control AVVISA, non blocca più** (deciso
// dall'utente). Prima queste stesse regole rifiutavano l'operazione e la
// persona non poteva farci niente: si ritrovava con un messaggio e nessuna
// via d'uscita, sulla propria campagna. Ora ogni regola violata diventa un
// avviso che **dice l'impatto** e viaggia con l'operazione fino a chi
// approva.
//
// La rete di sicurezza vera non era questa: è che **niente parte da solo**.
// Ogni operazione resta in coda finché una persona non la approva a mano, e
// lo script esegue solo le approvate (regola AGENDA PIANI dei Definitivi).
// Quella non si tocca — è lì che gli avvisi vanno letti.
//
// `blocchi` resta nel tipo di ritorno, e resta VUOTO: i chiamanti lo
// controllano ancora, così il giorno che si volesse rimettere un divieto —
// uno solo, per un motivo preciso — basta rimetterlo qui.
export function validaModifica(opts: {
  classe: string;
  livello: string;
  deltaBudgetPct: number | null;
  rollbackPiano: string | null;
  ultimaModifica: Date | null;
  /**
   * QUALE era la modifica precedente. Senza, l'avviso diceva «seconda modifica
   * in 69 ore» e basta: un fatto vero e inutilizzabile, perché per decidere
   * bisogna sapere **cosa** era stato cambiato — e chi legge doveva andarselo
   * a cercare nello storico. Chiesto dall'utente il 24/08/2026 guardando
   * l'avviso: «mostrami quali sono le modifiche già fatte».
   */
  ultimaModificaVoce?: { descrizione: string; prima: string | null; dopo: string | null; livello: string } | null;
  // quante L2/L3 sono gia state fatte questa settimana su questa campagna
  l2Settimana?: number;
  adesso?: Date;
}): { blocchi: string[]; avvisi: string[] } {
  const blocchi: string[] = [];
  const avvisi: string[] = [];
  const adesso = opts.adesso ?? new Date();
  const traino = opts.classe === "traino";

  if (opts.deltaBudgetPct != null) {
    const delta = Math.abs(opts.deltaBudgetPct);
    if (delta > 30) {
      avvisi.push(
        "Budget oltre il 30% in un colpo: l'algoritmo riparte ad apprendere e per qualche giorno la resa peggiora. I Definitivi (doc 11 §2) chiedono passi da 20-30%."
      );
    } else if (delta > 20) {
      avvisi.push("Variazione budget tra 20% e 30%: è una L2, da monitorare a +24h e +72h.");
    }
  }
  if (opts.ultimaModifica) {
    const ore = (adesso.getTime() - opts.ultimaModifica.getTime()) / 3600_000;
    if (ore < ORE_BLACKOUT) {
      const v = opts.ultimaModificaVoce;
      // Cos'era: il passaggio prima→dopo se c'è (è la forma che si legge in un
      // colpo d'occhio), altrimenti la descrizione registrata.
      const cosa = v
        ? v.prima && v.dopo
          ? `«${v.prima} → ${v.dopo}»${v.livello ? ` (${v.livello})` : ""}`
          : `«${v.descrizione}»`
        : null;
      // Quando torna giudicabile: un avviso che dice solo «è troppo presto»
      // lascia a chi legge il conto delle ore. Dirgli l'ora esatta trasforma
      // l'avviso in una decisione: aspetto fino alle 16:09, o vado lo stesso.
      const fine = new Date(opts.ultimaModifica.getTime() + ORE_BLACKOUT * 3600_000);
      const quando = fine.toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      avvisi.push(
        `Seconda modifica sulla stessa campagna in ${Math.round(ore)} ore` +
          (cosa ? `: la precedente era ${cosa}` : "") +
          `. I risultati dei prossimi giorni non diranno quale delle due li ha prodotti, e la prima non sarà più giudicabile (doc 11 §3.4 chiede 72h). ` +
          `Aspettando fino alle ${quando} l'avviso non c'è più. Le negative L0 non contano.`
      );
    }
  }
  if (traino) {
    const giorno = adesso.getDay(); // 0 dom, 5 ven, 6 sab
    if (giorno === 0 || giorno === 5 || giorno === 6) {
      avvisi.push(
        "Campagna TRAINO toccata tra venerdì e domenica: se va storto il weekend è quando fa il fatturato e non c'è nessuno a rimediare (doc 11 §3.4)."
      );
    }
    if ((opts.livello === "L2" || opts.livello === "L3") && !opts.rollbackPiano?.trim()) {
      avvisi.push(
        "L2/L3 su TRAINO senza piano di rollback: se peggiora, nessuno sa com'era prima né quando tornare indietro. Basta scriverlo nel campo apposta."
      );
    }
    if ((opts.livello === "L2" || opts.livello === "L3") && (opts.l2Settimana ?? 0) >= 1) {
      avvisi.push(
        `Su questa TRAINO ci sono già ${opts.l2Settimana} modifiche L2/L3 questa settimana: i Definitivi ne prevedono una (doc 11 §2), perché oltre non si distingue più l'effetto di ciascuna.`
      );
    }
    if (opts.livello === "L3") {
      avvisi.push("L3 su TRAINO: i Definitivi la vogliono in esperimento 50/50, non in diretta (doc 11 §2).");
    }
  }
  return { blocchi, avvisi };
}

// ---------- Rotazione creativa (doc 8.3) ----------
// Prossimo slot del lunedì e finestre di freeze stagionale.
export function prossimoSlotLunedi(da: Date = new Date()): Date {
  const d = new Date(da);
  d.setHours(9, 30, 0, 0);
  const giorno = d.getDay();
  const avanti = giorno === 1 && da.getHours() < 10 ? 0 : ((8 - giorno) % 7) || 7;
  d.setDate(d.getDate() + avanti);
  return d;
}

// Freeze Ferragosto (doc 8.3): lanci fermi dal giovedì 13/8 a fine W5 (23/8).
export function inFreezeCreativo(d: Date = new Date()): { freeze: boolean; fino: Date | null } {
  const anno = d.getFullYear();
  const inizio = new Date(anno, 7, 13);
  const fine = new Date(anno, 7, 23, 23, 59);
  if (d >= inizio && d <= fine) return { freeze: true, fino: fine };
  return { freeze: false, fino: null };
}

// Trigger di fatigue (doc 8.3 §3): costo/risultato ≥2× storico = sostituire;
// +50-99% per 2 settimane = preparare il ricambio; CPM +20% con costi in salita.
export function triggerFatigue(metriche: MetricaGiorno[]): string | null {
  if (metriche.length < 21) return null;
  const recenti = metriche.slice(-7);
  const storico = metriche.slice(0, -7);
  const costoR = (m: MetricaGiorno[]) => {
    const conv = somma(m, "conversioni");
    return conv > 0 ? somma(m, "spesa") / conv : null;
  };
  const ora = costoR(recenti);
  const prima = costoR(storico);
  if (ora != null && prima != null && prima > 0) {
    if (ora >= prima * 2) return `Creative fatigue: costo/risultato ${ora.toFixed(0)} € ≥ 2× lo storico (${prima.toFixed(0)} €) → sostituire nello slot del lunedì`;
    if (ora >= prima * 1.5) return `Fatigue in arrivo: costo/risultato +${Math.round((ora / prima - 1) * 100)}% vs storico → preparare il ricambio`;
  }
  const cpm = (m: MetricaGiorno[]) => {
    const impr = somma(m, "impression");
    return impr > 0 ? (somma(m, "spesa") / impr) * 1000 : null;
  };
  const cpmOra = cpm(recenti);
  const cpmPrima = cpm(storico);
  if (cpmOra != null && cpmPrima != null && cpmPrima > 0 && cpmOra >= cpmPrima * 1.2 && ora != null && prima != null && ora > prima) {
    return `CPM +${Math.round((cpmOra / cpmPrima - 1) * 100)}% con costi in salita: possibile fatigue I+D`;
  }
  return null;
}

// ---------- CHECK OBBLIGATORIO: VALORE vs NUMERO (ISTRUZIONI, dal 16/7/2026) ----------
// In ogni audit, per OGNI campagna attiva, va registrato se l'obiettivo
// ottimizza per VALORE o per NUMERO, con raccomandazione motivata.
// Il valore si sceglie solo con valori di conversione affidabili e volume
// sufficiente: su Google tROAS da ≥15 conversioni con valore in 30 giorni.

export type ValoreNumero = {
  tipo: "valore" | "numero" | "manuale" | "sconosciuto";
  etichetta: string;
  raccomandazione: string;
  // true quando la strategia andrebbe cambiata
  daCambiare: boolean;
};

const STRATEGIE_VALORE = ["TARGET_ROAS", "MAXIMIZE_CONVERSION_VALUE"];
const STRATEGIE_NUMERO = ["TARGET_CPA", "MAXIMIZE_CONVERSIONS"];

export function valoreONumero(
  strategia: string | null,
  conv30: number,
  ricavi30: number
): ValoreNumero {
  const idoneaAlValore = conv30 >= 15 && ricavi30 > 0;
  if (!strategia) {
    return {
      tipo: "sconosciuto",
      etichetta: "Strategia non letta",
      raccomandazione:
        "La strategia di offerta non è ancora arrivata dalla piattaforma: il check VALORE vs NUMERO non è compilabile. Lancia lo script di Google Ads.",
      daCambiare: false,
    };
  }
  if (STRATEGIE_VALORE.includes(strategia)) {
    return {
      tipo: "valore",
      etichetta: "Ottimizza per VALORE",
      raccomandazione: idoneaAlValore
        ? `Corretta: ${conv30} conversioni con valore negli ultimi 30 giorni (soglia 15).`
        : `Attenzione: ottimizza per valore ma ha solo ${conv30} conversioni con valore in 30 giorni (servono ≥15). Con questi volumi il valore è rumore: valutare il ritorno a Massimizza conversioni.`,
      daCambiare: !idoneaAlValore,
    };
  }
  if (STRATEGIE_NUMERO.includes(strategia)) {
    return {
      tipo: "numero",
      etichetta: "Ottimizza per NUMERO",
      raccomandazione: idoneaAlValore
        ? `Candidata al passaggio a VALORE: ha ${conv30} conversioni con valore in 30 giorni (soglia ≥15). Ricorda che il cambio resetta l'apprendimento — passa dal foglio "Aggiornamento Campagne".`
        : `Corretta per ora: ${conv30} conversioni con valore in 30 giorni, sotto la soglia di 15 per il tROAS.`,
      daCambiare: idoneaAlValore,
    };
  }
  return {
    tipo: "manuale",
    etichetta: `Strategia ${strategia}`,
    raccomandazione:
      "Strategia manuale o non automatica: valutare il passaggio a una strategia automatica se il volume di conversioni lo consente.",
    daCambiare: false,
  };
}

// ---------- A4: annunci in revisione (doc 11 §4) ----------
// ">50% degli annunci attivi in review/limited per >24h" — arancione.
export function alertA4(inReview: number | null, totali: number | null): AlertRilevato | null {
  if (!inReview || !totali || totali === 0) return null;
  if (inReview / totali > 0.5) {
    return {
      tipo: "A4",
      livello: "arancio",
      messaggio: `Review: ${inReview} annunci su ${totali} sono in revisione o limitati da oltre 24h (soglia 50%)`,
    };
  }
  return null;
}

// ---------- Add-before-pause (doc 11 §2, ERR-2026-001) ----------
// "Il vincente non si pausa finché il sostituto non è Approved da ≥48h con
// ≥7 giorni di dati." Vale sulle campagne traino.
export function addBeforePause(opts: {
  classe: string;
  tipo: string;
  sostitutoApprovatoIl: Date | null;
  sostitutoGiorniDati: number | null;
  adesso?: Date;
}): string | null {
  if (opts.classe !== "traino") return null;
  if (!["pausa_campagna", "pausa_keyword"].includes(opts.tipo)) return null;

  const adesso = opts.adesso ?? new Date();
  if (!opts.sostitutoApprovatoIl) {
    return "Add-before-pause (doc 11, nato da ERR-2026-001): su una traino non si mette in pausa il vincente senza un sostituto già attivo. Dichiara il sostituto e da quando è approvato.";
  }
  const ore = (adesso.getTime() - opts.sostitutoApprovatoIl.getTime()) / 3600_000;
  if (ore < 48) {
    return `Add-before-pause: il sostituto è approvato da ${Math.round(ore)}h, ne servono almeno 48.`;
  }
  if ((opts.sostitutoGiorniDati ?? 0) < 7) {
    return `Add-before-pause: il sostituto ha ${opts.sostitutoGiorniDati ?? 0} giorni di dati, ne servono almeno 7.`;
  }
  return null;
}
