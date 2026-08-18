/**
 * Deluxy Fondo — punteggio di attenzione su un titolo con cambio di management.
 *
 * Impianto preso dall'analisi quantitativa (docs/analisi/04-metodo-quantitativo.md), con
 * due regole che qui sono vincolanti:
 *
 * 1. **Una variabile senza dati si ESCLUDE**, non vale zero. I pesi si rinormalizzano su
 *    quelle disponibili, e la quota di peso coperta viaggia insieme al punteggio.
 * 2. **Sotto il 50% di copertura non si mostra un numero**: si scrive «da valutare».
 *    Un punteggio costruito su un terzo dei dati è peggio di nessun punteggio, perché
 *    sembra uguale a uno costruito su tutti.
 *
 * I pesi sono fissati a priori per ragionamento economico e NON ottimizzati sui dati: con
 * poche decine di eventi, ottimizzarli sarebbe sovradattamento per costruzione.
 *
 * Il punteggio NON è un consiglio di acquisto: misura quanto un caso somiglia alle
 * condizioni che la letteratura associa ai turnaround riusciti. È un ordinatore di
 * attenzione, non un segnale operativo.
 */

import { normalizza } from "./statistica";
import type { Blocco, EventoManagement, Punteggio, VariabileScore } from "./tipi";
import { PESO_TIER } from "./tipi";
import type { Indicatori } from "./indicatori";
import type { Fondamentali } from "./fonti";
import { esercizioNoto, variazione as variazioneBilancio, type Bilanci } from "./bilanci";

export const PESI_BLOCCHI = {
  evento: 30,
  fondamentali: 25,
  valutazione: 20,
  momentum: 15,
  sentiment: 10,
} as const;

/** Sotto questa copertura il punteggio non viene mostrato. */
export const COPERTURA_MINIMA = 0.5;

function componi(nome: string, variabili: VariabileScore[]): Blocco {
  let num = 0;
  let den = 0;
  let pesoTotale = 0;
  for (const v of variabili) {
    pesoTotale += v.peso;
    if (v.normalizzato === null) continue; // esclusa, non zero
    num += v.peso * v.normalizzato;
    den += v.peso;
  }
  return {
    nome,
    valore: den > 0 ? num / den : null,
    copertura: pesoTotale > 0 ? den / pesoTotale : 0,
    variabili,
  };
}

const AL_MESE = 30 * 86_400_000;

/** Blocco «evento»: quanto è informativo il cambio di management più recente. */
function bloccoEvento(evento: EventoManagement | null): Blocco {
  if (!evento) {
    return componi("Evento di management", [
      { nome: "tier", etichetta: "Tipo di evento", peso: 0.4, grezzo: null, normalizzato: null, unita: null, provenienza: "Nessun evento registrato" },
      { nome: "forzato", etichetta: "Uscita forzata", peso: 0.25, grezzo: null, normalizzato: null, unita: null, provenienza: "Nessun evento registrato" },
      { nome: "esterno", etichetta: "Successore esterno", peso: 0.2, grezzo: null, normalizzato: null, unita: null, provenienza: "Nessun evento registrato" },
      { nome: "freschezza", etichetta: "Quanto è recente", peso: 0.15, grezzo: null, normalizzato: null, unita: null, provenienza: "Nessun evento registrato" },
    ]);
  }

  const mesi = (Date.now() - Date.parse(evento.dataAnnuncio)) / AL_MESE;
  return componi("Evento di management", [
    {
      nome: "tier",
      etichetta: "Tipo di evento",
      peso: 0.4,
      grezzo: PESO_TIER[evento.tier],
      // Il tier è già una scala 0,3-1: si usa così com'è.
      normalizzato: PESO_TIER[evento.tier],
      unita: evento.tier,
      provenienza: `Evento «${evento.titolo}» del ${evento.dataAnnuncio}`,
    },
    {
      nome: "forzato",
      etichetta: "Uscita forzata del predecessore",
      peso: 0.25,
      grezzo: evento.forzato === null ? null : evento.forzato ? 1 : 0,
      normalizzato: evento.forzato === null ? null : evento.forzato ? 1 : 0.2,
      unita: null,
      provenienza: evento.forzato === null ? "Non accertato dalle fonti" : "Ricostruito dai comunicati e dalla stampa",
    },
    {
      nome: "esterno",
      etichetta: "Successore esterno al gruppo",
      peso: 0.2,
      grezzo: evento.successoreEsterno === null ? null : evento.successoreEsterno ? 1 : 0,
      normalizzato: evento.successoreEsterno === null ? null : evento.successoreEsterno ? 1 : 0.3,
      unita: null,
      provenienza: evento.successoreEsterno === null ? "Non accertato dalle fonti" : "Ricostruito dalle biografie pubbliche",
    },
    {
      nome: "freschezza",
      etichetta: "Quanto è recente l'evento",
      peso: 0.15,
      grezzo: mesi,
      // La finestra utile della letteratura è 6-24 mesi: prima è troppo presto per i numeri,
      // dopo la tesi è già nel prezzo o è fallita.
      normalizzato: mesi < 0 ? null : mesi <= 24 ? normalizza(Math.abs(mesi - 12), 0, 24, "basso") : 0.1,
      unita: "mesi",
      provenienza: `Annuncio del ${evento.dataAnnuncio}`,
    },
  ]);
}

function ultimoValore(f: Fondamentali, voce: string): number | null {
  const serie = f?.[voce];
  if (!serie?.length) return null;
  return serie[serie.length - 1].valore;
}

function variazioneVoce(f: Fondamentali, voce: string): number | null {
  const serie = f?.[voce];
  if (!serie || serie.length < 2) return null;
  const ultimo = serie[serie.length - 1].valore;
  const prima = serie[serie.length - 2].valore;
  if (!prima) return null;
  return ultimo / prima - 1;
}

/**
 * Blocco «fondamentali» dai bilanci ricostruiti su fonte primaria.
 *
 * È la versione buona: usa la posizione finanziaria netta after lease e l'equity free cash
 * flow after lease, cioè le metriche su cui la società comunica davvero. Le stesse voci
 * prese dai fondamentali gratuiti danno una leva sbagliata del 48% e un free cash flow con
 * il segno della tendenza invertito.
 */
function bloccoFondamentaliVerificati(bilanci: Bilanci): Blocco {
  const e = esercizioNoto(bilanci);
  if (!e) return bloccoFondamentali(null);

  const margine = e.ebitdaAL !== null && e.ricavi !== null && e.ricavi > 0 ? e.ebitdaAL / e.ricavi : null;
  const provenienza = `Bilancio ${e.esercizio}, pubblicato il ${e.pubblicato} (fonte primaria)`;

  return componi("Fondamentali", [
    {
      nome: "leva",
      etichetta: "Debito netto after lease / EBITDAaL",
      peso: 0.35,
      grezzo: e.leva,
      normalizzato: normalizza(e.leva, 2, 6, "basso"),
      unita: "x",
      provenienza,
    },
    {
      nome: "fcf",
      etichetta: "Equity free cash flow after lease",
      peso: 0.3,
      grezzo: e.equityFcfAL,
      normalizzato: e.equityFcfAL === null ? null : e.equityFcfAL > 0 ? 1 : 0.15,
      unita: "mln €",
      provenienza,
    },
    {
      nome: "margine",
      etichetta: "Margine EBITDAaL",
      peso: 0.2,
      grezzo: margine,
      normalizzato: normalizza(margine, 0.1, 0.45, "alto"),
      unita: "%",
      provenienza: `Calcolato: EBITDAaL / ricavi, bilancio ${e.esercizio}`,
    },
    {
      nome: "trendRicavi",
      etichetta: "Variazione dei ricavi da servizi",
      peso: 0.15,
      grezzo: variazioneBilancio(bilanci, "ricaviDaServizi"),
      normalizzato: normalizza(variazioneBilancio(bilanci, "ricaviDaServizi"), -0.08, 0.08, "alto"),
      unita: "%",
      // I perimetri cambiano da un esercizio all'altro: la variazione grezza va letta con l'avviso.
      provenienza: `Ultimi due esercizi pubblicati — attenzione al perimetro: ${e.perimetro}`,
    },
  ]);
}

/** Blocco «fondamentali»: la società ha il tempo e la cassa per fare il turnaround? */
function bloccoFondamentali(f: Fondamentali | null): Blocco {
  const debito = f ? ultimoValore(f, "annualTotalDebt") : null;
  const ebitda = f ? ultimoValore(f, "annualEBITDA") : null;
  const fcf = f ? ultimoValore(f, "annualFreeCashFlow") : null;
  const ricavi = f ? ultimoValore(f, "annualTotalRevenue") : null;
  const leva = debito !== null && ebitda !== null && ebitda > 0 ? debito / ebitda : null;
  const margine = ebitda !== null && ricavi !== null && ricavi > 0 ? ebitda / ricavi : null;

  return componi("Fondamentali", [
    {
      nome: "leva",
      etichetta: "Debito lordo / EBITDA",
      peso: 0.35,
      grezzo: leva,
      // Sotto 2x c'è respiro, sopra 6x il turnaround lo incassano i creditori.
      normalizzato: normalizza(leva, 2, 6, "basso"),
      unita: "x",
      provenienza: "Yahoo fondamentali (debito lordo, non posizione finanziaria netta)",
    },
    {
      nome: "fcf",
      etichetta: "Free cash flow, ultimo esercizio",
      peso: 0.3,
      grezzo: fcf,
      normalizzato: fcf === null ? null : fcf > 0 ? 1 : 0.15,
      unita: "valuta",
      provenienza: "Yahoo fondamentali",
    },
    {
      nome: "margine",
      etichetta: "Margine EBITDA",
      peso: 0.2,
      grezzo: margine,
      normalizzato: normalizza(margine, 0.1, 0.45, "alto"),
      unita: "%",
      provenienza: "Calcolato: EBITDA / ricavi",
    },
    {
      nome: "trendRicavi",
      etichetta: "Variazione dei ricavi",
      peso: 0.15,
      grezzo: f ? variazioneVoce(f, "annualTotalRevenue") : null,
      normalizzato: normalizza(f ? variazioneVoce(f, "annualTotalRevenue") : null, -0.08, 0.08, "alto"),
      unita: "%",
      provenienza: "Calcolato sugli ultimi due esercizi disponibili",
    },
  ]);
}

/**
 * Blocco «valutazione».
 *
 * Al momento è vuoto di proposito: per EV/EBITDA servono capitalizzazione e posizione
 * finanziaria netta a una data certa, che le fonti gratuite verificate non danno in modo
 * affidabile. Lasciarlo dichiaratamente scoperto abbassa la copertura e lo si vede: è
 * l'opposto di riempirlo con una stima che sembrerebbe un dato.
 */
function bloccoValutazione(): Blocco {
  return componi("Valutazione", [
    {
      nome: "evEbitda",
      etichetta: "EV / EBITDA rispetto alla media storica",
      peso: 0.6,
      grezzo: null,
      normalizzato: null,
      unita: "x",
      provenienza: "Non disponibile: servono capitalizzazione e debito netto a data certa",
    },
    {
      nome: "evEbitdaPeer",
      etichetta: "EV / EBITDA rispetto ai concorrenti",
      peso: 0.4,
      grezzo: null,
      normalizzato: null,
      unita: "x",
      provenienza: "Non disponibile: manca un peer set con dati omogenei",
    },
  ]);
}

/** Blocco «momentum»: il mercato si sta già accorgendo o no. */
function bloccoMomentum(ind: Indicatori): Blocco {
  return componi("Momentum", [
    {
      nome: "relativo6m",
      etichetta: "Rendimento a 6 mesi rispetto all'indice",
      peso: 0.5,
      grezzo: ind.rendimentiRelativi["6m"],
      normalizzato: normalizza(ind.rendimentiRelativi["6m"], -0.3, 0.3, "alto"),
      unita: "%",
      provenienza: "Calcolato sulle serie rettificate",
    },
    {
      nome: "ma200",
      etichetta: "Distanza dalla media a 200 sedute",
      peso: 0.25,
      grezzo: ind.distanzaMa200,
      normalizzato: normalizza(ind.distanzaMa200, -0.25, 0.25, "alto"),
      unita: "%",
      provenienza: "Calcolato sulle serie rettificate",
    },
    {
      nome: "momentum61",
      etichetta: "Momentum 6 mesi meno l'ultimo",
      peso: 0.25,
      grezzo: ind.momentum6m1m,
      normalizzato: normalizza(ind.momentum6m1m, -0.3, 0.3, "alto"),
      unita: "%",
      provenienza: "Calcolato sulle serie rettificate",
    },
  ]);
}

/**
 * Blocco «sentiment»: dichiaratamente non calcolato.
 *
 * Dedurre un tono da titoli di giornale significa ricavare un dato critico dal testo
 * libero, che in questo progetto non si fa: un titolo non è un fatto societario. Il blocco
 * resta scoperto e pesa sulla copertura, invece di introdurre un numero inventato.
 */
function bloccoSentiment(notizieRilevanti: number | null): Blocco {
  return componi("Notizie", [
    {
      nome: "tono",
      etichetta: "Tono delle notizie",
      peso: 0.6,
      grezzo: null,
      normalizzato: null,
      unita: null,
      provenienza: "Non calcolato per scelta: un titolo di giornale non è un fatto societario",
    },
    {
      nome: "copertura",
      etichetta: "Notizie rilevanti negli ultimi giorni",
      peso: 0.4,
      grezzo: notizieRilevanti,
      // Conta solo come indicatore di attenzione, non di direzione.
      normalizzato: notizieRilevanti === null ? null : normalizza(notizieRilevanti, 0, 20, "alto"),
      unita: "notizie",
      provenienza: "Conteggio dei titoli con parole di governance o operazioni straordinarie",
    },
  ]);
}

export function calcolaPunteggio(opzioni: {
  evento: EventoManagement | null;
  indicatori: Indicatori;
  fondamentali: Fondamentali | null;
  /** Bilanci da fonte primaria: quando ci sono, hanno la precedenza sui dati gratuiti. */
  bilanci?: Bilanci | null;
  notizieRilevanti: number | null;
}): Punteggio {
  const blocchi: Blocco[] = [
    bloccoEvento(opzioni.evento),
    opzioni.bilanci ? bloccoFondamentaliVerificati(opzioni.bilanci) : bloccoFondamentali(opzioni.fondamentali),
    bloccoValutazione(),
    bloccoMomentum(opzioni.indicatori),
    bloccoSentiment(opzioni.notizieRilevanti),
  ];

  const pesi = [PESI_BLOCCHI.evento, PESI_BLOCCHI.fondamentali, PESI_BLOCCHI.valutazione, PESI_BLOCCHI.momentum, PESI_BLOCCHI.sentiment];
  const pesoTotale = pesi.reduce((s, p) => s + p, 0);

  let num = 0;
  let den = 0;
  blocchi.forEach((b, i) => {
    if (b.valore === null) return;
    // Il peso del blocco entra ridotto in proporzione a quanto è coperto dai dati.
    const pesoEffettivo = pesi[i] * b.copertura;
    num += pesoEffettivo * b.valore;
    den += pesoEffettivo;
  });

  const copertura = den / pesoTotale;
  if (copertura < COPERTURA_MINIMA) {
    return {
      valore: null,
      copertura,
      esito: `Da valutare: disponibile solo il ${Math.round(copertura * 100)}% dei dati previsti, sotto la soglia del ${COPERTURA_MINIMA * 100}%.`,
      blocchi,
    };
  }

  return { valore: (num / den) * 100, copertura, esito: null, blocchi };
}
