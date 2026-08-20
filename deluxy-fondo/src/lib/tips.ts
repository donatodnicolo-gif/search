/**
 * Deluxy Fondo — candidati e livelli di ingresso.
 *
 * COSA FA E COSA NON FA, perché la differenza è tutta qui.
 *
 * Non produce raccomandazioni. Fa due cose diverse, entrambe verificabili:
 *
 *  1. **Screening**: ordina l'universo per quanto ogni caso somiglia alle condizioni che la
 *     letteratura associa ai turnaround riusciti — uscita forzata del predecessore,
 *     successore esterno, evento recente, titolo che ha sottoperformato prima del cambio.
 *     Sono criteri dichiarati e ispezionabili, non un giudizio: chi legge vede *perché* un
 *     nome entra nel radar e può non essere d'accordo.
 *
 *  2. **Livelli di ingresso**: dato un criterio scelto da chi investe — «uno sconto del 10%
 *     sulla media a 200 giorni», «il minimo delle ultime 52 settimane» — calcola a quale
 *     prezzo corrisponde oggi. La regola è dell'utente, il conto è dell'app. È l'opposto di
 *     «compra a 21 euro».
 *
 * Un avvertimento che la pagina ripete e che vale la pena tenere a mente scrivendo codice
 * qui: l'analisi alla base di questa app ha dato **esito negativo** sulla tesi. Uno screening
 * ben fatto su una tesi non dimostrata produce candidati ben ordinati, non buoni investimenti.
 */

import { leggiSerie } from "./archivio.ts";
import { calcolaMandato, type Mandato } from "./indicatori.ts";
import { variazione } from "./statistica.ts";
import { BENCHMARK_MERCATO, BENCHMARK_TOTALE, EVENTI_TUTTI, TITOLI_TUTTI } from "./universo.ts";
import { PESO_TIER, type EventoManagement, type SerieStorica } from "./tipi";

/** Un criterio dello screening: cosa chiede, se è soddisfatto, e quanto pesa. */
export type Criterio = {
  nome: string;
  /** `true` soddisfatto, `false` no, `null` non accertabile — e non accertabile non è «no». */
  soddisfatto: boolean | null;
  peso: number;
  spiegazione: string;
};

export type Livelli = {
  prezzo: number | null;
  data: string | null;
  valuta: string;
  media200: number | null;
  media50: number | null;
  minimo52: number | null;
  massimo52: number | null;
  /** Mediana delle chiusure degli ultimi sei mesi: un riferimento meno volatile della media. */
  mediana6m: number | null;
  /** Distanza dal massimo a 52 settimane: negativa se il prezzo è sotto. */
  daMassimo: number | null;
  /** Distanza dalla media a 200 giorni. */
  daMedia200: number | null;
};

export type Candidato = {
  simbolo: string;
  nome: string;
  settore: string;
  paese: string;
  evento: EventoManagement;
  persona: string | null;
  /** Da 0 a 100: quanto il caso somiglia alle condizioni della tesi. Non è una previsione. */
  affinita: number;
  /** La copertura dei criteri effettivamente valutabili. Sotto la metà il numero non si mostra. */
  copertura: number;
  criteri: Criterio[];
  mandato: Mandato | null;
  livelli: Livelli;
  /** Mesi trascorsi dall'annuncio della nomina. */
  mesiDallEvento: number;
  /**
   * Se la persona è già al comando. Una nomina annunciata ma efficace fra mesi non è un
   * mandato: a guidare è ancora il predecessore, e il titolo che si misurerebbe è il suo.
   */
  insediato: boolean;
};

function mediana(valori: number[]): number | null {
  const v = valori.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mediaUltime(serie: SerieStorica, n: number): number | null {
  if (serie.barre.length < n) return null;
  const ultime = serie.barre.slice(-n);
  return ultime.reduce((s, b) => s + b.chiusura, 0) / n;
}

export function calcolaLivelli(serie: SerieStorica | null): Livelli {
  const vuoto: Livelli = {
    prezzo: null, data: null, valuta: "EUR", media200: null, media50: null,
    minimo52: null, massimo52: null, mediana6m: null, daMassimo: null, daMedia200: null,
  };
  if (!serie?.barre.length) return vuoto;

  const ultimo = serie.barre[serie.barre.length - 1];
  const anno = serie.barre.slice(-252).map((b) => b.chiusura);
  const semestre = serie.barre.slice(-126).map((b) => b.chiusura);
  const media200 = mediaUltime(serie, 200);
  const massimo52 = anno.length ? Math.max(...anno) : null;

  return {
    prezzo: ultimo.chiusura,
    data: ultimo.data,
    valuta: serie.valuta,
    media200,
    media50: mediaUltime(serie, 50),
    minimo52: anno.length ? Math.min(...anno) : null,
    massimo52,
    mediana6m: mediana(semestre),
    daMassimo: massimo52 ? variazione(massimo52, ultimo.chiusura) : null,
    daMedia200: media200 ? variazione(media200, ultimo.chiusura) : null,
  };
}

/**
 * Valuta un caso contro i criteri della tesi.
 *
 * I pesi vengono dall'analisi quantitativa e sono fissati a priori, non ottimizzati sui dati:
 * con poche decine di casi, ottimizzarli sarebbe sovradattamento per costruzione. Un criterio
 * non accertabile viene **escluso** e i pesi si rinormalizzano, come ovunque in questa app.
 */
function valutaCriteri(
  evento: EventoManagement,
  mesi: number,
  rendimentoPrima: number | null
): { criteri: Criterio[]; affinita: number; copertura: number } {
  const criteri: Criterio[] = [
    {
      nome: "Uscita forzata del predecessore",
      soddisfatto: evento.forzato,
      peso: 30,
      spiegazione:
        "È la condizione più solida della letteratura: il turnover ha valore informativo quando è imposto, non quando è una successione ordinata.",
    },
    {
      nome: "Successore arrivato da fuori",
      soddisfatto: evento.successoreEsterno,
      peso: 25,
      spiegazione:
        "Chi viene da fuori non ha firmato le decisioni precedenti, e nei campioni studiati il miglioramento è maggiore.",
    },
    {
      nome: "Il titolo aveva sottoperformato prima del cambio",
      soddisfatto: rendimentoPrima === null ? null : rendimentoPrima < 0,
      peso: 20,
      spiegazione:
        "Il cambio di vertice dice qualcosa soprattutto dove le cose andavano male: è lì che c'è qualcosa da invertire.",
    },
    {
      nome: "Evento di primo livello",
      soddisfatto: PESO_TIER[evento.tier] >= 0.8,
      peso: 15,
      spiegazione: "Cambio del capo azienda o dell'azionista di controllo, non di una figura di contorno.",
    },
    {
      nome: "Finestra utile: fra 3 e 24 mesi dall'annuncio",
      soddisfatto: mesi >= 3 && mesi <= 24,
      peso: 10,
      spiegazione:
        "Prima di tre mesi non c'è nulla da misurare; dopo due anni la tesi è già nel prezzo oppure è fallita.",
    },
  ];

  // Un evento contaminato non viene escluso, ma perde peso: il movimento del prezzo non è
  // attribuibile al cambio di gestione, e questo va scontato.
  const penalita = evento.contaminato ? 0.75 : 1;

  let num = 0;
  let den = 0;
  for (const c of criteri) {
    if (c.soddisfatto === null) continue;
    den += c.peso;
    if (c.soddisfatto) num += c.peso;
  }

  const totale = criteri.reduce((s, c) => s + c.peso, 0);
  return {
    criteri,
    affinita: den > 0 ? (num / den) * 100 * penalita : 0,
    copertura: den / totale,
  };
}

export type ScreeningTips = {
  /** Casi con il nuovo amministratore delegato già al comando. */
  candidati: Candidato[];
  /**
   * Nomine annunciate ma non ancora efficaci. Sono i casi più interessanti per chi guarda
   * avanti — la storia che la tesi pretende di anticipare deve ancora cominciare — e i meno
   * misurabili, perché non c'è un solo giorno di gestione da valutare.
   */
  attesa: Candidato[];
  benchmarkUsato: string;
  /** Quanti casi sono stati esclusi perché senza prezzi o senza evento di gestione. */
  esclusi: number;
};

export async function screening(): Promise<ScreeningTips> {
  const totale = await leggiSerie(BENCHMARK_TOTALE);
  const benchmark = totale ?? (await leggiSerie(BENCHMARK_MERCATO));
  const oggi = new Date().toISOString().slice(0, 10);

  const nomine = EVENTI_TUTTI.filter(
    (e) =>
      e.categoria === "management" &&
      !e.id.endsWith("-out") &&
      !e.id.includes("piano") &&
      e.dataAnnuncio <= oggi
  );

  // Un titolo per il suo evento di gestione più recente: la domanda è «questo caso è a target
  // oggi», non «lo è stato in passato».
  const piuRecente = new Map<string, EventoManagement>();
  for (const e of nomine) {
    const attuale = piuRecente.get(e.simbolo);
    if (!attuale || e.dataAnnuncio > attuale.dataAnnuncio) piuRecente.set(e.simbolo, e);
  }

  const candidati: Candidato[] = [];
  let esclusi = 0;

  for (const [simbolo, evento] of piuRecente) {
    const titolo = TITOLI_TUTTI.find((t) => t.simbolo === simbolo);
    const serie = await leggiSerie(simbolo);
    if (!titolo || !serie?.barre.length) {
      esclusi++;
      continue;
    }

    const mesi = (Date.now() - Date.parse(evento.dataAnnuncio)) / (30.44 * 86_400_000);

    // Come andava il titolo nei due anni PRIMA del cambio: è il contesto che rende
    // informativo un avvicendamento.
    const iEvento = serie.barre.findIndex((b) => b.data >= evento.dataAnnuncio);
    const iPrima = iEvento - 504;
    const rendimentoPrima =
      iEvento > 0 && iPrima >= 0 ? variazione(serie.barre[iPrima].chiusura, serie.barre[iEvento].chiusura) : null;

    const { criteri, affinita, copertura } = valutaCriteri(evento, mesi, rendimentoPrima);

    candidati.push({
      simbolo,
      nome: titolo.nome,
      settore: titolo.settore,
      paese: titolo.paese,
      evento,
      persona: evento.persona ?? null,
      affinita,
      copertura,
      criteri,
      mandato: calcolaMandato(
        {
          eventoId: evento.id,
          chi: evento.titolo,
          tier: evento.tier,
          forzato: evento.forzato,
          successoreEsterno: evento.successoreEsterno,
          dataInizio: evento.dataAnnuncio,
          dataFine: null,
          dataEfficacia: evento.dataEfficacia,
        },
        serie,
        benchmark
      ),
      livelli: calcolaLivelli(serie),
      mesiDallEvento: mesi,
      insediato: !evento.dataEfficacia || evento.dataEfficacia <= oggi,
    });
  }

  // A parità di affinità vince il mandato più giovane. I criteri sono binari, quindi molti
  // casi finiscono appaiati in cima: il punteggio separa le classi, non i singoli. Fra due
  // casi della stessa classe, quello annunciato da meno tempo ha ancora davanti la parte di
  // storia che la tesi pretende di anticipare — l'altro l'ha già in gran parte consumata.
  candidati.sort((a, b) => b.affinita - a.affinita || a.mesiDallEvento - b.mesiDallEvento);
  return {
    candidati: candidati.filter((c) => c.insediato),
    // In attesa, i più imminenti per primi: è l'ordine in cui vanno guardati.
    attesa: candidati
      .filter((c) => !c.insediato)
      .sort((a, b) => (a.evento.dataEfficacia ?? "").localeCompare(b.evento.dataEfficacia ?? "")),
    benchmarkUsato: benchmark?.nome ?? "nessuno",
    esclusi,
  };
}

// ---------------------------------------------------------------------------
// Calcolatore del prezzo di ingresso
// ---------------------------------------------------------------------------

export type RegolaIngresso =
  | "media200"
  | "media50"
  | "mediana6m"
  | "minimo52"
  | "prezzoOggi";

export const REGOLE: { id: RegolaIngresso; nome: string; spiegazione: string }[] = [
  {
    id: "media200",
    nome: "Media a 200 giorni",
    spiegazione:
      "Il prezzo medio dell'ultimo anno di contrattazioni. Riferimento lento, poco sensibile ai singoli giorni.",
  },
  {
    id: "media50",
    nome: "Media a 50 giorni",
    spiegazione: "Il prezzo medio delle ultime dieci settimane: più reattivo, e più rumoroso.",
  },
  {
    id: "mediana6m",
    nome: "Mediana a sei mesi",
    spiegazione:
      "Il valore centrale delle chiusure del semestre. A differenza della media non si sposta per qualche seduta estrema.",
  },
  {
    id: "minimo52",
    nome: "Minimo delle 52 settimane",
    spiegazione:
      "Il punto più basso dell'ultimo anno. Attenzione: un titolo può passarci sotto e restarci — non è un pavimento.",
  },
  {
    id: "prezzoOggi",
    nome: "Prezzo di oggi",
    spiegazione: "L'ultima chiusura disponibile, senza alcun riferimento storico.",
  },
];

export type CalcoloIngresso = {
  regola: RegolaIngresso;
  nomeRegola: string;
  /** Il valore di riferimento su cui si applica lo sconto. */
  riferimento: number | null;
  /** Sconto richiesto, in frazione (0,10 = 10%). */
  sconto: number;
  /** Prezzo a cui la regola corrisponde. */
  prezzoIngresso: number | null;
  /** Quanto è distante dal prezzo attuale: negativo = bisogna che scenda. */
  distanzaDaOggi: number | null;
  /** Quante sedute dell'ultimo anno hanno chiuso a quel prezzo o sotto. */
  seduteSottoLivello: number | null;
  seduteTotali: number;
  problema: string | null;
};

/**
 * Traduce una regola scelta dall'utente in un prezzo.
 *
 * `seduteSottoLivello` è il dato più onesto della funzione: dice quante volte, nell'ultimo
 * anno, il titolo ha davvero chiuso a quel livello o sotto. Un prezzo d'ingresso che non si
 * è mai visto in dodici mesi è un ordine che probabilmente non verrà mai eseguito, e questo
 * va mostrato invece di lasciarlo scoprire aspettando.
 */
export function calcolaIngresso(
  serie: SerieStorica | null,
  livelli: Livelli,
  regola: RegolaIngresso,
  sconto: number
): CalcoloIngresso {
  const nomeRegola = REGOLE.find((r) => r.id === regola)?.nome ?? regola;
  const riferimento =
    regola === "media200" ? livelli.media200
    : regola === "media50" ? livelli.media50
    : regola === "mediana6m" ? livelli.mediana6m
    : regola === "minimo52" ? livelli.minimo52
    : livelli.prezzo;

  const base: CalcoloIngresso = {
    regola,
    nomeRegola,
    riferimento,
    sconto,
    prezzoIngresso: null,
    distanzaDaOggi: null,
    seduteSottoLivello: null,
    seduteTotali: 0,
    problema: null,
  };

  if (riferimento === null) {
    return { ...base, problema: "Riferimento non calcolabile: storico insufficiente per questa regola." };
  }

  const prezzoIngresso = riferimento * (1 - sconto);
  const anno = serie?.barre.slice(-252) ?? [];
  const sotto = anno.filter((b) => b.chiusura <= prezzoIngresso).length;

  return {
    ...base,
    prezzoIngresso,
    distanzaDaOggi: livelli.prezzo ? variazione(livelli.prezzo, prezzoIngresso) : null,
    seduteSottoLivello: anno.length ? sotto : null,
    seduteTotali: anno.length,
    problema:
      anno.length && sotto === 0
        ? "Nell'ultimo anno il titolo non ha mai chiuso a questo livello o sotto: un ordine a questo prezzo potrebbe non essere mai eseguito."
        : null,
  };
}
