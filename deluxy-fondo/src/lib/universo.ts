/**
 * Deluxy Fondo — universo monitorato ed eventi di management.
 *
 * L'universo NON contiene solo casi riusciti. Contiene di proposito anche i cambi di
 * management che non hanno prodotto nulla (Stellantis, Bayer): un'app che mostra solo i
 * vincitori insegna la lezione sbagliata, ed è esattamente la trappola — selezione ex post
 * del caso che ha funzionato — su cui l'analisi 5 ha basato la sua obiezione principale.
 *
 * Le date vengono dalle analisi in docs/analisi/. La confidenza è dichiarata per evento:
 * `alta` = fonte primaria o comunicato; `media` = stampa finanziaria; `bassa` = da verificare.
 */

import type { EventoManagement } from "./tipi";

export type Titolo = {
  simbolo: string;
  nome: string;
  paese: string;
  settore: string;
  isin: string | null;
  /** Il titolo è il caso-guida della tesi, oppure un controllo (successo o fallimento). */
  ruolo: "guida" | "controllo-riuscito" | "controllo-fallito";
  benchmark: string;
  note: string | null;
};

export const BENCHMARK_MERCATO = "FTSEMIB.MI";

export const TITOLI: Titolo[] = [
  {
    simbolo: "TIT.MI",
    nome: "TIM (Telecom Italia)",
    paese: "Italia",
    settore: "Telecomunicazioni",
    isin: "IT0005712671",
    ruolo: "guida",
    benchmark: BENCHMARK_MERCATO,
    note: "ISIN cambiato il 12/06/2026 (era IT0003497168) e raggruppamento 1:10 il 15/06/2026.",
  },
  {
    simbolo: "UCG.MI",
    nome: "UniCredit",
    paese: "Italia",
    settore: "Banche",
    isin: null,
    ruolo: "controllo-riuscito",
    benchmark: BENCHMARK_MERCATO,
    note: "Andrea Orcel da aprile 2021. Da verificare quanto sia merito del management e quanto dei tassi.",
  },
  {
    simbolo: "LDO.MI",
    nome: "Leonardo",
    paese: "Italia",
    settore: "Difesa e aerospazio",
    isin: null,
    ruolo: "controllo-riuscito",
    benchmark: BENCHMARK_MERCATO,
    note: "Roberto Cingolani da maggio 2023, in coincidenza con il re-rating della difesa europea.",
  },
  {
    simbolo: "STLAM.MI",
    nome: "Stellantis",
    paese: "Italia / Paesi Bassi",
    settore: "Automotive",
    isin: null,
    ruolo: "controllo-fallito",
    benchmark: BENCHMARK_MERCATO,
    note: "Uscita di Tavares (12/2024) e arrivo di Filosa (06/2025): cambio di vertice senza inversione del titolo.",
  },
  {
    simbolo: "BAYN.DE",
    nome: "Bayer",
    paese: "Germania",
    settore: "Farmaceutica e agrochimica",
    isin: null,
    ruolo: "controllo-fallito",
    benchmark: BENCHMARK_MERCATO,
    note: "Bill Anderson da giugno 2023: ristrutturazione radicale, titolo comunque molto sotto i livelli 2018.",
  },
];

export const TITOLO_GUIDA = "TIT.MI";

/**
 * Eventi di management dell'universo.
 *
 * `contaminato: true` = nella finestra dell'evento cade anche altro (offerta, risultati,
 * operazione straordinaria), quindi il movimento del prezzo NON è attribuibile al cambio
 * di management. È il caso più importante da segnalare, perché è quello che inganna.
 */
export const EVENTI: EventoManagement[] = [
  {
    id: "tim-cattaneo-in",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2016-03-30",
    dataEfficacia: null,
    tier: "T2",
    titolo: "Flavio Cattaneo amministratore delegato",
    descrizione:
      "Nominato su indicazione di Vivendi/Bolloré dopo le dimissioni di Patuano. Mandato dichiarato: taglio costi per 1,6-1,8 miliardi.",
    forzato: true,
    successoreEsterno: true,
    contaminato: false,
    confidenza: "media",
    fonti: [{ titolo: "Fortune — Telecom Italia CEO quits", url: "https://fortune.com/2016/03/19/telecom-italia-ceo-quits-vivendi", data: "2016-03-19" }],
  },
  {
    id: "tim-cattaneo-out",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2017-07-28",
    dataEfficacia: "2017-07-31",
    tier: "T2",
    titolo: "Uscita di Cattaneo per sfiducia di Bolloré",
    descrizione:
      "Uscita non programmata dopo la rottura con l'azionista. Nello stesso periodo il CdA prende atto della direzione e coordinamento di Vivendi.",
    forzato: true,
    successoreEsterno: null,
    contaminato: true,
    confidenza: "media",
    fonti: [
      { titolo: "SoldiOnline — l'uscita di Flavio Cattaneo", url: "https://www.soldionline.it/notizie/azioni-italia/telecom-italia-ufficializza-l-uscita-di-flavio-cattaneo", data: "2017-07-28" },
    ],
  },
  {
    id: "tim-genish-in",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2017-09-28",
    dataEfficacia: null,
    tier: "T3",
    titolo: "Amos Genish amministratore delegato",
    descrizione: "Uomo di Vivendi. Presenterà il piano DigiTIM e lo scorporo legale della rete d'accesso.",
    forzato: false,
    successoreEsterno: false,
    contaminato: false,
    confidenza: "media",
    fonti: [],
  },
  {
    id: "tim-elliott-assemblea",
    categoria: "controllo",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2018-05-04",
    dataEfficacia: "2018-05-04",
    tier: "T1",
    titolo: "Elliott vince l'assemblea: 10 consiglieri su 15",
    descrizione:
      "La lista del fondo attivista prende il 49,84% dei presenti contro il 47,18% di Vivendi. Cambio di controllo di fatto del consiglio.",
    forzato: false,
    successoreEsterno: null,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "AGI — TIM, Elliott batte Vivendi", url: "https://www.agi.it/economia/news/2018-05-05/tim_elliott_vivendi-3854831/", data: "2018-05-05" }],
  },
  {
    id: "tim-genish-out",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2018-11-13",
    dataEfficacia: "2018-11-13",
    tier: "T2",
    titolo: "Revoca di tutte le deleghe a Genish",
    descrizione: "Il CdA a maggioranza Elliott revoca le deleghe (10 voti contro 5) e le assegna ad interim al presidente Conti.",
    forzato: true,
    successoreEsterno: null,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "ANSA — TIM, il CdA revoca Genish", url: "http://www.ansa.it/sito/notizie/economia/2018/11/13/tim-cda-revoca-genish-deleghe-a-conti_f16ffea3-a381-4375-8bba-e2127002a6c0.html", data: "2018-11-13" }],
  },
  {
    id: "tim-gubitosi-in",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2018-11-18",
    dataEfficacia: "2018-11-18",
    tier: "T2",
    titolo: "Luigi Gubitosi amministratore delegato e direttore generale",
    descrizione: "Espressione dell'asse Elliott-CDP. Successore esterno alla gestione precedente.",
    forzato: false,
    successoreEsterno: true,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "ANSA — Gubitosi AD e DG", url: "https://www.ansa.it/sito/notizie/economia/2018/11/18/tim-comitato-nomine-propone-gubitosi-come-amministratore-delegato-e-direttore-generale_98d0873c-cc24-4f51-94ed-bf2f1393765e.html", data: "2018-11-18" }],
  },
  {
    id: "tim-gubitosi-out",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: "2021-11-21",
    dataAnnuncio: "2021-11-26",
    dataEfficacia: "2021-11-26",
    tier: "T2",
    titolo: "Dimissioni di Gubitosi dopo tre profit warning",
    descrizione:
      "ATTENZIONE: nella stessa settimana KKR presenta una manifestazione d'interesse non vincolante a 0,505 € per azione (premio ~46% sulla chiusura del 19/11). Il balzo del titolo è dell'offerta, non dell'uscita dell'amministratore delegato: i due eventi non sono separabili.",
    forzato: true,
    successoreEsterno: null,
    contaminato: true,
    confidenza: "alta",
    fonti: [
      { titolo: "Broadband TV News — Gubitosi resigns amid KKR interest", url: "https://www.broadbandtvnews.com/2021/11/29/telecom-italia-head-luigi-gubitosi-resigns-amid-kkr-interest/", data: "2021-11-29" },
      { titolo: "SoldiOnline — interesse di KKR", url: "https://www.soldionline.it/notizie/azioni-italia/telecom-italia-tim-interesse-kkr", data: "2021-11-22" },
    ],
  },
  {
    id: "tim-labriola-in",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: "2021-11-26",
    dataAnnuncio: "2022-01-21",
    dataEfficacia: "2022-01-21",
    tier: "T3",
    titolo: "Pietro Labriola amministratore delegato",
    descrizione:
      "Prima direttore generale (novembre 2021), poi AD. Successore interno al gruppo (veniva da TIM Brasil). Mandato: separazione verticale fra rete e servizi.",
    forzato: false,
    successoreEsterno: false,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "Light Reading — Labriola confermato CEO", url: "https://www.lightreading.com/services/telecom-italia-confirms-pietro-labriola-as-ceo", data: "2022-01-21" }],
  },
  {
    id: "tim-piano-free-to-run",
    categoria: "management",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2024-03-07",
    dataEfficacia: null,
    tier: "T3",
    titolo: "Capital Market Day: il piano «Free to Run» del management in carica",
    descrizione:
      "È l'unico evento riconducibile al lavoro di un amministratore delegato che abbia prodotto una reazione statisticamente significativa su TIM in dieci anni — e ha segno negativo: circa −20% di rendimento anomalo, t = −5,97, con il titolo a −23,7% in una sola seduta. Nessuna delle cinque analisi iniziali lo citava.",
    forzato: null,
    successoreEsterno: null,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "TIM — piano industriale 2024-2026", url: "https://www.gruppotim.it/en/press-archive/corporate/2024/PR-Industrial-Plan-2024-2026.html", data: "2024-03-06" }],
  },
  {
    id: "tim-netco-closing",
    categoria: "perimetro",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2024-07-01",
    dataEfficacia: "2024-07-01",
    tier: "T1",
    titolo: "Closing della cessione di NetCo a KKR e soci",
    descrizione:
      "Non è un cambio di management ma la discontinuità che spiega la svolta dei conti: enterprise value 18,8 miliardi (fino a 22 con earn-out) e riduzione del debito di circa 14 miliardi. Registrato qui perché senza di esso i bilanci prima e dopo non sono confrontabili.",
    forzato: null,
    successoreEsterno: null,
    contaminato: true,
    confidenza: "alta",
    fonti: [{ titolo: "TIM — closing NetCo", url: "https://www.gruppotim.it/en/press-archive/corporate/2024/PR-Closing-NetCo-1-luglio.html", data: "2024-07-01" }],
  },
  {
    id: "tim-poste-vivendi",
    categoria: "controllo",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2025-03-29",
    dataEfficacia: "2025-03-29",
    tier: "T1",
    titolo: "Poste Italiane rileva da Vivendi il 15%",
    descrizione: "Cambio dell'azionista di riferimento: Poste sale al 24,81% dell'ordinario, Vivendi scende al 2,51% e poi esce.",
    forzato: null,
    successoreEsterno: null,
    contaminato: false,
    confidenza: "alta",
    fonti: [{ titolo: "ANSA — TIM torna italiana", url: "https://www.ansa.it/sito/notizie/economia/2025/03/29/tim-torna-italiana-poste-italiane-sale-al-2481_d0a9db3a-1b31-4dac-95dc-6d280e40f40a.html", data: "2025-03-29" }],
  },
  {
    id: "tim-opas-poste",
    categoria: "controllo",
    simbolo: "TIT.MI",
    dataRumor: null,
    dataAnnuncio: "2026-03-22",
    dataEfficacia: null,
    tier: "T1",
    titolo: "Poste annuncia un'OPAS totalitaria su TIM",
    descrizione:
      "Offerta pubblica di acquisto e scambio con obiettivo oltre il 66,67% e delisting da Euronext Milan. Periodo di adesione dal 20/07/2026 all'11/09/2026.",
    forzato: null,
    successoreEsterno: null,
    contaminato: true,
    confidenza: "alta",
    fonti: [{ titolo: "Poste Italiane — comunicato OPAS su TIM", url: "https://www.posteitaliane.it/it/media/comunicati/cs-opas-poste-italiane-su-tim-ita-22-3-2026", data: "2026-03-22" }],
  },

  // --- Controlli: cambi di management fuori da TIM -------------------------
  {
    id: "ucg-orcel-in",
    categoria: "management",
    simbolo: "UCG.MI",
    dataRumor: null,
    dataAnnuncio: "2021-04-15",
    dataEfficacia: "2021-04-15",
    tier: "T2",
    titolo: "Andrea Orcel amministratore delegato di UniCredit",
    descrizione: "Successore esterno di peso. Il mandato coincide però con il ciclo di rialzo dei tassi: alpha e beta sono difficili da separare.",
    forzato: false,
    successoreEsterno: true,
    contaminato: false,
    confidenza: "media",
    fonti: [],
  },
  {
    id: "ldo-cingolani-in",
    categoria: "management",
    simbolo: "LDO.MI",
    dataRumor: null,
    dataAnnuncio: "2023-05-09",
    dataEfficacia: "2023-05-09",
    tier: "T2",
    titolo: "Roberto Cingolani amministratore delegato di Leonardo",
    descrizione: "Successore esterno, nomina di indirizzo governativo, in coincidenza con il re-rating della difesa europea.",
    forzato: false,
    successoreEsterno: true,
    contaminato: true,
    confidenza: "media",
    fonti: [],
  },
  {
    id: "stlam-tavares-out",
    categoria: "management",
    simbolo: "STLAM.MI",
    dataRumor: null,
    dataAnnuncio: "2024-12-01",
    dataEfficacia: "2024-12-01",
    tier: "T2",
    titolo: "Dimissioni di Carlos Tavares da Stellantis",
    descrizione: "Uscita forzata dopo un anno chiuso attorno al -45%. Caso di controllo: il cambio al vertice non ha invertito il titolo.",
    forzato: true,
    successoreEsterno: null,
    contaminato: false,
    confidenza: "media",
    fonti: [{ titolo: "ANSA — finisce l'era Tavares", url: "https://www.ansa.it/sito/notizie/economia/2024/12/01/finisce-lera-tavares-nuovo-ceo-stellantis-a-meta-2025_2b1cf4f7-ed3c-474c-bfb6-2f7fe357aff8.html", data: "2024-12-01" }],
  },
  {
    id: "stlam-filosa-in",
    categoria: "management",
    simbolo: "STLAM.MI",
    dataRumor: null,
    dataAnnuncio: "2025-06-23",
    dataEfficacia: "2025-06-23",
    tier: "T3",
    titolo: "Antonio Filosa amministratore delegato di Stellantis",
    descrizione: "Successore interno. Caso di controllo negativo: a un anno dalla nomina il titolo risultava ancora molto sotto.",
    forzato: false,
    successoreEsterno: false,
    contaminato: false,
    confidenza: "media",
    fonti: [],
  },
  {
    id: "bayn-anderson-in",
    categoria: "management",
    simbolo: "BAYN.DE",
    dataRumor: null,
    dataAnnuncio: "2023-06-01",
    dataEfficacia: "2023-06-01",
    tier: "T2",
    titolo: "Bill Anderson amministratore delegato di Bayer",
    descrizione:
      "Successore esterno con ristrutturazione radicale dell'organizzazione. Caso di controllo: il recupero del 2026 arriva dal contenzioso Roundup, non dalla riorganizzazione.",
    forzato: false,
    successoreEsterno: true,
    contaminato: true,
    confidenza: "media",
    fonti: [{ titolo: "Bayer — Bill Anderson to become CEO", url: "https://www.bayer.com/media/en-us/bill-anderson-to-become-ceo-of-bayer-ag/", data: "2023-02-01" }],
  },
];

export const trovaTitolo = (simbolo: string) => TITOLI.find((t) => t.simbolo === simbolo) ?? null;
export const eventiDi = (simbolo: string) =>
  EVENTI.filter((e) => e.simbolo === simbolo).sort((a, b) => b.dataAnnuncio.localeCompare(a.dataAnnuncio));

/**
 * Il mandato in corso: l'ultimo **cambio di chi guida l'azienda**, già annunciato.
 *
 * Deliberatamente esclude gli eventi di controllo e di perimetro. Su TIM, l'evento più
 * recente in assoluto è l'offerta pubblica di Poste (marzo 2026), ma l'amministratore
 * delegato è Pietro Labriola dal gennaio 2022: è da lì che si misura la gestione. Prendere
 * l'offerta come «ultimo evento di management» significherebbe attribuire alla gestione un
 * movimento prodotto da un compratore — l'errore esatto che questa app esiste per evitare.
 *
 * Sono esclusi anche gli eventi di uscita (`-out`): un mandato comincia con chi arriva.
 */
export function mandatoInCorso(simbolo: string, alGiorno = new Date().toISOString().slice(0, 10)) {
  return (
    EVENTI.filter(
      (e) =>
        e.simbolo === simbolo &&
        e.categoria === "management" &&
        e.dataAnnuncio <= alGiorno &&
        !e.id.endsWith("-out") &&
        // Un piano industriale è lavoro del management in carica, non l'inizio di un mandato.
        !e.id.includes("piano")
    ).sort((a, b) => b.dataAnnuncio.localeCompare(a.dataAnnuncio))[0] ?? null
  );
}
