import { breakEvenRoas } from "@/lib/guardrail";
import type { GruppoConNumeri } from "@/lib/gruppi";

// Da segnali sparsi a cose da fare. La scheda campagna mostra già alert,
// pacing e regole se/allora, ma sono testi da leggere: qui diventano una lista
// di voci con un bottone che le trasforma in azioni vere del kanban.
//
// REGOLA: nessuna voce viene inventata dal nulla. Ognuna nasce da un numero che
// si può mostrare accanto, e dice cosa fare — non "guarda che c'è un problema".

export type Opportunita = {
  chiave: string; // stabile: serve a capire se l'azione esiste già
  titolo: string;
  perche: string;
  priorita: "alta" | "media" | "bassa";
  // Dove si va a farla: link interno all'app
  dove?: string;
  // Voce solo informativa: non ha senso trasformarla in azione
  soloNota?: boolean;
  // DA DOVE NASCE. Una proposta senza provenienza è un'opinione: chi la legge
  // deve poter risalire al numero e alla regola che l'hanno prodotta.
  origine?: string;
  // Da quando è vera, se è una cosa con una data (gli alert ce l'hanno).
  dal?: Date | null;
};

export type DatiOpportunita = {
  campagna: {
    id: string;
    nome: string;
    brand: string;
    stato: string;
    classe: string;
    budgetGiornaliero: number | null;
    strategiaOfferta: string | null;
    tipoConversione: string | null;
  };
  // Metriche in ordine cronologico (la più vecchia per prima)
  metriche: { data: Date; spesa: number | null; conversioni: number | null; ricavi: number | null }[];
  gruppi: GruppoConNumeri[];
  keyword: { testo: string; spesa: number | null; incasso: number | null }[];
  alert: { tipo: string; livello: string; messaggio: string; creatoIl?: Date }[];
  inBlackoutFino: Date | null;
  // Quota impressioni media del periodo (0-1), null se Google non la dà
  copertura: { quota: number; persaBudget: number; persaRank: number } | null;
  // Termini di ricerca già arrivati (i più costosi)
  termini: { testo: string; spesa: number | null; conversioni: number | null; stato: string }[];
  // Spesa spartita per dispositivo, giorno, rete
  segmenti: { tipo: string; valore: string; spesa: number | null; ricavi: number | null }[];
  // Quanti pezzi di annuncio esistono, per tipo
  estensioni: { sitelink: number; callout: number; snippet: number; immagine: number };
  // Titoli delle azioni già aperte su questa campagna: non si ripropone
  // quello che è già in lista.
  azioniAperte: string[];
};

const ETICHETTA_SEGMENTO: Record<string, string> = {
  MOBILE: "il telefono", DESKTOP: "il computer", TABLET: "il tablet",
  MONDAY: "il lunedì", TUESDAY: "il martedì", WEDNESDAY: "il mercoledì",
  THURSDAY: "il giovedì", FRIDAY: "il venerdì", SATURDAY: "il sabato", SUNDAY: "la domenica",
  SEARCH_PARTNERS: "i partner di ricerca", CONTENT: "la rete Display",
};

const somma = (righe: { spesa?: number | null; conversioni?: number | null; ricavi?: number | null }[], campo: "spesa" | "conversioni" | "ricavi") =>
  righe.reduce((s, r) => s + (r[campo] ?? 0), 0);

export function opportunitaCampagna(d: DatiOpportunita): Opportunita[] {
  const lista: Opportunita[] = [];
  const be = breakEvenRoas(d.campagna.brand);
  const ultimi30 = d.metriche.slice(-30);
  const ultimi14 = d.metriche.slice(-14);
  const ultimi7 = d.metriche.slice(-7);
  const spesa30 = somma(ultimi30, "spesa");
  const ricavi30 = somma(ultimi30, "ricavi");
  const conv30 = somma(ultimi30, "conversioni");
  const spesa14 = somma(ultimi14, "spesa");
  const ricavi14 = somma(ultimi14, "ricavi");
  const roas30 = spesa30 > 0 ? ricavi30 / spesa30 : null;
  const vendite = d.campagna.tipoConversione !== "lead";

  // 1. I dati che mancano vengono prima di ogni giudizio: senza gruppi non si
  //    sa quale pezzo della campagna sta bruciando.
  if (d.gruppi.length === 0 && spesa30 > 0) {
    lista.push({
      chiave: "gruppi-assenti",
      titolo: `Far arrivare i gruppi di annunci di "${d.campagna.nome}"`,
      perche:
        `Questa campagna ha speso ${spesa30.toFixed(0)} € in 30 giorni ma nell'app non c'è ancora nessun gruppo: ` +
        `non si può sapere quale gruppo tiene su il risultato e quale lo mangia. Serve una copia dello script con AZIONE = "gruppi" su questo account.`,
      priorita: "alta",
      dove: "/gruppi",
    });
  }

  // 2. Gli alert del doc 11: già rilevati, qui diventano cose da fare.
  for (const a of d.alert) {
    lista.push({
      chiave: `alert-${a.tipo}`,
      titolo: `Chiudere l'alert ${a.tipo} su "${d.campagna.nome}"`,
      perche: a.messaggio,
      priorita: a.livello === "rosso" ? "alta" : "media",
      origine: `Alert ${a.tipo} rilevato dall'app`,
      dal: a.creatoIl ?? null,
    });
  }

  // 3. Soldi che escono senza niente in cambio. Due soglie diverse: 14 giorni a
  //    zero è un guasto, 30 giorni sotto il break-even è una scelta sbagliata.
  if (spesa14 >= 100 && ricavi14 === 0 && vendite) {
    lista.push({
      chiave: "spesa-a-vuoto",
      titolo: `Capire perché "${d.campagna.nome}" spende senza incassare`,
      perche:
        `${spesa14.toFixed(0)} € negli ultimi 14 giorni e zero ricavi attribuiti. ` +
        `O il tracciamento non registra (da verificare prima di toccare la campagna), o l'intento è sbagliato.`,
      priorita: "alta",
    });
  } else if (roas30 != null && spesa30 >= 100 && roas30 < be && vendite) {
    lista.push({
      chiave: "sotto-break-even",
      titolo: `Riportare "${d.campagna.nome}" sopra il break-even`,
      perche:
        `ROAS 30 giorni ${roas30.toFixed(2).replace(".", ",")}× contro un break-even di ${be.toFixed(2).replace(".", ",")}× per ${d.campagna.brand}: ` +
        `su ${spesa30.toFixed(0)} € spesi la campagna sta perdendo. Prima le keyword e i gruppi peggiori, poi il budget.`,
      priorita: "alta",
    });
  }

  // 4. Il gruppo che si mangia la campagna: pesa tanto e rende sotto il pari.
  const spesaGruppi = d.gruppi.reduce((s, g) => s + g.spesa, 0);
  for (const g of d.gruppi) {
    const quota = spesaGruppi > 0 ? g.spesa / spesaGruppi : 0;
    if (g.spesa >= 50 && quota >= 0.2 && g.roas != null && g.roas < be && vendite) {
      lista.push({
        chiave: `gruppo-sotto-${g.id}`,
        titolo: `Decidere che fare del gruppo "${g.nome}"`,
        perche:
          `Si prende il ${Math.round(quota * 100)}% della spesa della campagna (${g.spesa.toFixed(0)} €) e rende ` +
          `${g.roas.toFixed(2).replace(".", ",")}× contro un break-even di ${be.toFixed(2).replace(".", ",")}×. Da lì si può metterlo in pausa passando dalla coda approvata.`,
        priorita: "alta",
        dove: `/gruppi/${g.id}`,
      });
    }
    if (g.spesa >= 50 && g.roas != null && g.roas >= be * 1.5) {
      lista.push({
        chiave: `gruppo-vincente-${g.id}`,
        titolo: `Dare più spazio al gruppo "${g.nome}"`,
        perche:
          `${g.roas.toFixed(2).replace(".", ",")}× su ${g.spesa.toFixed(0)} € spesi, sopra il target di ${(be * 1.5).toFixed(2).replace(".", ",")}×. ` +
          `Vale la pena guardare se è limitato dal budget della campagna prima di alzare la spesa altrove.`,
        priorita: "media",
        dove: `/gruppi/${g.id}`,
      });
    }
  }

  // 5. Keyword che bruciano da sole: si vedono solo se lo script copy gira.
  const kwVuote = d.keyword
    .filter((k) => (k.spesa ?? 0) >= 25 && (k.incasso ?? 0) === 0)
    .sort((a, b) => (b.spesa ?? 0) - (a.spesa ?? 0))
    .slice(0, 3);
  if (kwVuote.length > 0 && vendite) {
    const totale = kwVuote.reduce((s, k) => s + (k.spesa ?? 0), 0);
    lista.push({
      chiave: "keyword-a-vuoto",
      titolo: `Valutare ${kwVuote.length} keyword che spendono a vuoto`,
      perche:
        `${kwVuote.map((k) => `"${k.testo}" ${(k.spesa ?? 0).toFixed(0)} €`).join(", ")} — ${totale.toFixed(0)} € in tutto senza un incasso. ` +
        `Da escludere o da riscrivere l'annuncio che ci risponde.`,
      priorita: "media",
      dove: "/keywords",
    });
  }

  // 6. Apprendimento: sotto ~50 eventi a settimana l'algoritmo non impara
  //    (doc 8.1 §5.2). Si dice quale budget servirebbe, non si cambia niente.
  const cpa30 = conv30 > 0 ? spesa30 / conv30 : null;
  if (d.campagna.budgetGiornaliero && cpa30 && cpa30 > 0) {
    const eventiSettimana = (d.campagna.budgetGiornaliero * 7) / cpa30;
    if (eventiSettimana < 50) {
      lista.push({
        chiave: "apprendimento",
        titolo: `Decidere se "${d.campagna.nome}" può uscire dall'apprendimento`,
        perche:
          `Col budget di oggi (${d.campagna.budgetGiornaliero} €/g) e un costo per conversione di ${cpa30.toFixed(0)} € ` +
          `si arriva a ${Math.round(eventiSettimana)} eventi a settimana, sotto i 50 che servono. ` +
          `Servirebbero ${((cpa30 * 50) / 7).toFixed(0)} €/g: o si alza, o si accetta che resti in apprendimento.`,
        priorita: "media",
      });
    }
  }

  // 7. VALORE vs NUMERO (check obbligatorio dal 16/07/2026)
  const strategia = (d.campagna.strategiaOfferta ?? "").toUpperCase();
  const aNumero = strategia.indexOf("TARGET_CPA") !== -1 || strategia.indexOf("MAXIMIZE_CONVERSIONS") !== -1;
  if (aNumero && ricavi30 > 0 && conv30 >= 15) {
    lista.push({
      chiave: "valore-vs-numero",
      titolo: `Passare "${d.campagna.nome}" a un'offerta a valore`,
      perche:
        `Sta ottimizzando il NUMERO di conversioni (${d.campagna.strategiaOfferta}) ma incassa davvero ` +
        `(${ricavi30.toFixed(0)} € su ${conv30.toFixed(0)} conversioni in 30 giorni): con ≥15 conversioni a valore ` +
        `il check obbligatorio chiede di valutare tROAS o massimizza-valore.`,
      priorita: "media",
    });
  }

  // 8. Pacing: il budget non si spende, o si spende troppo in fretta.
  if (d.campagna.budgetGiornaliero && ultimi7.length >= 5) {
    const spesa7 = somma(ultimi7, "spesa");
    const atteso = d.campagna.budgetGiornaliero * ultimi7.length;
    const rapporto = atteso > 0 ? spesa7 / atteso : 1;
    if (rapporto < 0.7) {
      lista.push({
        chiave: "pacing-basso",
        titolo: `Capire perché "${d.campagna.nome}" non spende il budget`,
        perche:
          `Negli ultimi ${ultimi7.length} giorni ha speso ${spesa7.toFixed(0)} € su ${atteso.toFixed(0)} € disponibili ` +
          `(${Math.round(rapporto * 100)}%). Di solito è copertura d'asta o offerte troppo basse, non il budget.`,
        priorita: "media",
      });
    }
  }

  // 8-bis. La quota impressioni: due diagnosi opposte, due rimedi opposti.
  if (d.copertura) {
    if (d.copertura.persaBudget >= 0.2) {
      lista.push({
        chiave: "persa-per-budget",
        titolo: `Alzare il budget di "${d.campagna.nome}": la domanda c'è e non la serviamo`,
        perche:
          `Il ${Math.round(d.copertura.persaBudget * 100)}% delle ricerche buone non ci vede perché il budget finisce ` +
          `(quota impressioni ${Math.round(d.copertura.quota * 100)}%). Questa è l'unica situazione in cui alzare il budget ` +
          `porta davvero altro volume${roas30 != null && roas30 >= be ? `, e qui la campagna rende ${roas30.toFixed(2).replace(".", ",")}× sopra il pari` : ""}.`,
        priorita: roas30 != null && roas30 >= be ? "alta" : "media",
      });
    }
    if (d.copertura.persaRank >= 0.4) {
      lista.push({
        chiave: "persa-per-rank",
        titolo: `Lavorare su offerte e qualità di "${d.campagna.nome}"`,
        perche:
          `Si perde il ${Math.round(d.copertura.persaRank * 100)}% delle impressioni per posizione, non per budget: ` +
          `alzare la spesa non cambierebbe niente. Qui contano offerta, punteggio di qualità e pertinenza della pagina.`,
        priorita: "media",
      });
    }
  }

  // 8-ter. Ricerche che hanno bruciato soldi senza portare niente.
  const daEscludere = d.termini.filter(
    (t) => t.stato === "nuovo" && (t.spesa ?? 0) >= 15 && !(t.conversioni ?? 0)
  );
  if (daEscludere.length > 0 && vendite) {
    const bruciati = daEscludere.reduce((s, t) => s + (t.spesa ?? 0), 0);
    lista.push({
      chiave: "termini-da-escludere",
      titolo: `Escludere ${daEscludere.length} ricerche che non portano niente`,
      perche:
        `${bruciati.toFixed(0)} € su ricerche come ${daEscludere.slice(0, 3).map((t) => `"${t.testo}"`).join(", ")} ` +
        `senza una conversione. Dalla scheda si mettono in coda come negative, una per una.`,
      priorita: bruciati >= 100 ? "alta" : "media",
    });
  }

  // 8-quater. Un dispositivo o un giorno che rende sotto il pari mentre pesa.
  const perTipo: Record<string, { spesa: number; ricavi: number }[]> = {};
  for (const s of d.segmenti) {
    (perTipo[s.tipo] = perTipo[s.tipo] || []).push({ spesa: s.spesa ?? 0, ricavi: s.ricavi ?? 0 });
  }
  for (const s of d.segmenti) {
    const totale = (perTipo[s.tipo] ?? []).reduce((acc, x) => acc + x.spesa, 0);
    const spesa = s.spesa ?? 0;
    const resa = spesa > 0 ? (s.ricavi ?? 0) / spesa : null;
    const quota = totale > 0 ? spesa / totale : 0;
    if (spesa >= 50 && quota >= 0.25 && resa != null && resa < be * 0.6 && vendite) {
      lista.push({
        chiave: `segmento-${s.tipo}-${s.valore}`,
        titolo: `Guardare ${ETICHETTA_SEGMENTO[s.valore] ?? s.valore} su "${d.campagna.nome}"`,
        perche:
          `Si prende il ${Math.round(quota * 100)}% della spesa (${spesa.toFixed(0)} €) e rende ${resa.toFixed(2).replace(".", ",")}×, ` +
          `molto sotto il break-even di ${be.toFixed(2).replace(".", ",")}×. Un correttivo di offerta su questo taglio vale quanto una keyword esclusa.`,
        priorita: "media",
      });
    }
  }

  // 8-quinquies. Spazio gratuito nella pagina dei risultati lasciato vuoto.
  const mancanti: string[] = [];
  if (d.estensioni.sitelink === 0) mancanti.push("sitelink");
  if (d.estensioni.callout === 0) mancanti.push("callout");
  if (d.estensioni.snippet === 0) mancanti.push("snippet");
  if (mancanti.length > 0 && spesa30 > 0) {
    lista.push({
      chiave: "estensioni-mancanti",
      titolo: `Aggiungere ${mancanti.join(", ")} a "${d.campagna.nome}"`,
      perche:
        `La campagna spende ${spesa30.toFixed(0)} € al mese senza ${mancanti.join(" né ")}: sono spazio gratuito ` +
        `nella pagina dei risultati. Un annuncio più alto viene guardato di più a parità di offerta.`,
      priorita: "media",
    });
  }

  // 9. Il silenzio dei dati: se lo script non manda, ogni giudizio qui sopra
  //    sta guardando il passato.
  const ultimo = d.metriche[d.metriche.length - 1]?.data ?? null;
  if (ultimo) {
    const giorni = Math.floor((Date.now() - ultimo.getTime()) / 86_400_000);
    if (giorni >= 2) {
      lista.push({
        chiave: "dati-fermi",
        titolo: `I dati di "${d.campagna.nome}" sono fermi da ${giorni} giorni`,
        perche:
          `L'ultimo giorno con metriche è il ${ultimo.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}. Di solito è la colonna Frequenza ` +
          `dello script rimasta vuota: "Esegui" lancia una volta sola.`,
        priorita: "alta",
        dove: "/ricezione",
      });
    }
  }

  // 10. Blackout: nota, non azione. Serve a non far partire modifiche adesso.
  if (d.inBlackoutFino && d.inBlackoutFino > new Date()) {
    lista.push({
      chiave: "blackout",
      titolo: `Non toccare fino al ${d.inBlackoutFino.toLocaleString("it-IT")}`,
      perche:
        `C'è stata una modifica da meno di 72 ore: i dati di questa finestra non valgono come giudizio (doc 10 §1.4). ` +
        `Le voci qui sopra restano valide, ma si eseguono dopo.`,
      priorita: "bassa",
      soloNota: true,
    });
  }

  const ordine = { alta: 0, media: 1, bassa: 2 };
  return lista
    .filter((o) => !d.azioniAperte.includes(o.titolo))
    .sort((a, b) => ordine[a.priorita] - ordine[b.priorita]);
}
