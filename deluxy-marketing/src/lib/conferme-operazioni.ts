import type { OperazioneAdv } from "@prisma/client";
import { prisma } from "@/lib/db";
import { testoKeywordPulito } from "@/lib/dominio";

// «Portata a termine o no?» — per OGNI operazione eseguita, non solo per le
// campagne nuove.
//
// ⚠️ PERCHÉ ESISTE. Su `/operazioni` «Eseguita» è la parola dello SCRIPT: dice
// che ha chiamato Google e Google non ha protestato. Per una campagna nuova
// non voleva dire niente (il bulk upload non risponde e la WORLD-ENG del 17/08
// era stata rifiutata), ma anche per le altre resta una parola sola. Qui si va
// a cercare la CONFERMA INDIPENDENTE: cosa ha rimandato Google DOPO
// l'esecuzione, nei giri di lettura che l'app riceve comunque —
//   · anagrafica     → esistenza, stato e budget delle campagne
//   · gruppi         → stato dei gruppi
//   · stati-keyword  → esistenza e stato delle keyword (censimento completo)
//
// ⚠️ TRE CAUTELE, tutte pagate altrove:
//  1. **L'app scrive da sola il valore atteso** quando lo script riferisce
//     l'esito (`/api/v1/operazioni/[id]/esito` aggiorna budget, stato gruppo,
//     stato keyword). Quindi «il dato attuale combacia» NON prova niente finché
//     Google non ha rimandato quel dato: la conferma vale solo se c'è una
//     consegna del tipo giusto, dell'account giusto, DOPO l'esecuzione.
//  2. **Il giro subito dopo l'esecuzione può ancora vedere lo stato di
//     partenza** (dentro `tutto` l'esegui gira per primo e l'anagrafica due
//     secondi dopo; per il bulk upload, che è asincrono, due secondi non
//     bastano di sicuro). Perciò una consegna «dello stesso giro» (entro
//     `MARGINE_STESSO_GIRO_MS`) basta a CONFERMARE quando il valore combacia,
//     ma NON basta a SMENTIRE: per dire «Google dice il contrario» serve un
//     giro successivo. Segnare fallito un lavoro riuscito è il difetto opposto.
//  3. **Una query per tipo di dato, non una per riga**: con cento operazioni in
//     pagina e `connection_limit 5` le query per riga fanno cadere la pagina.

export type StatoConferma =
  | "confermata" // Google ha rimandato il dato e combacia
  | "in_attesa" // nessuna consegna utile dopo l'esecuzione (o solo quella dello stesso giro, che non combacia ancora)
  | "smentita" // un giro successivo dice il contrario
  | "rifiutata" // campagna nuova: il caricamento non ha prodotto niente
  | "superata" // un'altra operazione ha toccato dopo lo stesso bersaglio: il dato di oggi non parla di questa
  | "non_verificabile"; // l'app non ha un dato indipendente per questo tipo

export type Conferma = {
  stato: StatoConferma;
  /** Etichetta corta per la pillola. */
  etichetta: string;
  /** Cosa dice Google, quando, e cosa fare. */
  frase: string;
  /** La consegna che fa fede, quando c'è. */
  quando: Date | null;
};

/** Entro questo margine una consegna è «dello stesso giro» dell'esecuzione. */
export const MARGINE_STESSO_GIRO_MS = 30 * 60 * 1000;
/** Dopo tanti giorni senza consegne utili, il silenzio si dichiara. */
const GIORNI_SILENZIO = 2;

// Quale consegna fa fede per ogni tipo di operazione. ⚠️ Per le keyword solo
// `stati-keyword`: il giro `copy` porta solo le keyword con numeri nel periodo,
// e una keyword appena messa in pausa può non comparirci — un censimento che
// non la contiene non direbbe niente. `stati-keyword` le manda tutte.
const CONSEGNA_CHE_FA_FEDE: Record<string, string> = {
  nuova_campagna: "anagrafica",
  budget: "anagrafica",
  pausa_campagna: "anagrafica",
  attiva_campagna: "anagrafica",
  pausa_gruppo: "gruppi",
  attiva_gruppo: "gruppi",
  pausa_keyword: "stati-keyword",
  attiva_keyword: "stati-keyword",
  nuova_keyword: "stati-keyword",
};

const ETICHETTA_CONSEGNA: Record<string, string> = {
  anagrafica: "l'elenco delle campagne",
  gruppi: "l'elenco dei gruppi",
  "stati-keyword": "il censimento delle keyword",
};

const ETICHETTA_STATO_GOOGLE: Record<string, string> = {
  ENABLED: "attiva",
  PAUSED: "in pausa",
  REMOVED: "rimossa",
};

const ETICHETTA_MATCH: Record<string, string> = { exact: "esatta", phrase: "a frase", broad: "generica" };

function normalizzaMatch(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const m = v.toLowerCase();
  if (m === "exact" || m === "esatta") return "exact";
  if (m === "phrase" || m === "frase") return "phrase";
  if (m === "broad" || m === "generica") return "broad";
  return m;
}

function euro(n: number): string {
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €/g`;
}

function dataOra(d: Date): string {
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function giorniDa(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

type Consegna = { account: string; tipo: string; ricevutoIl: Date };

/**
 * La prima consegna del tipo dato, dell'account dato, arrivata dopo `dopo`
 * (più un margine). Le consegne sono già ordinate per data crescente.
 */
function primaConsegnaDopo(
  consegne: Consegna[],
  account: string,
  tipo: string,
  dopo: Date,
  margineMs = 0
): Date | null {
  const soglia = dopo.getTime() + margineMs;
  const c = consegne.find((x) => x.account === account && x.tipo === tipo && x.ricevutoIl.getTime() > soglia);
  return c ? c.ricevutoIl : null;
}

/**
 * L'ULTIMA consegna utile: è **quella da cui viene il valore che sto
 * leggendo**, e quindi l'unica data che si può citare senza mentire.
 *
 * ⚠️ La prima consegna dopo l'esecuzione serve a decidere *se* Google ha
 * parlato; ma l'archivio tiene solo lo stato di ADESSO, non la storia di quel
 * campo. Scrivere «il censimento dell'11/08 riporta la keyword attiva» mentre
 * il valore letto è quello riscritto stamattina fa credere che io abbia visto
 * quel dato quel giorno: è falso, e sposta la colpa sul giorno sbagliato.
 */
function ultimaConsegnaDopo(consegne: Consegna[], account: string, tipo: string, dopo: Date): Date | null {
  let ultima: Date | null = null;
  for (const x of consegne) {
    if (x.account === account && x.tipo === tipo && x.ricevutoIl > dopo) ultima = x.ricevutoIl;
  }
  return ultima;
}

function inAttesa(tipoConsegna: string, eseguitaIl: Date, nota?: string): Conferma {
  const giorni = giorniDa(eseguitaIl);
  const cosa = ETICHETTA_CONSEGNA[tipoConsegna] ?? tipoConsegna;
  const silenzio =
    giorni >= GIORNI_SILENZIO
      ? ` ⚠️ Sono passati ${giorni} giorni senza che questo account mandasse ${cosa}: la conferma non può arrivare finché lo script non consegna.`
      : "";
  return {
    stato: "in_attesa",
    etichetta: "Da confermare",
    frase:
      (nota ? nota + " " : "") +
      `Si saprà quando arriverà ${cosa} dell'account, che è il dato che fa fede.` +
      silenzio,
    quando: null,
  };
}

/**
 * Per ogni operazione ESEGUITA, cosa dice Google dopo. Le altre (in attesa,
 * approvate, fallite, annullate) non compaiono nella mappa: per loro lo stato
 * dice già tutto.
 */
export async function confermeOperazioni(operazioni: OperazioneAdv[]): Promise<Map<string, Conferma>> {
  const esito = new Map<string, Conferma>();
  const eseguite = operazioni.filter((o) => o.stato === "eseguita" && o.eseguitaIl);
  if (eseguite.length === 0) return esito;

  // ── Le letture, una per tipo di dato ───────────────────────────────────
  const idsCampagne = [...new Set(eseguite.map((o) => o.campagnaId).filter((x): x is string => Boolean(x)))];
  const nomiCampagne = [...new Set(eseguite.filter((o) => !o.campagnaId).map((o) => o.bersaglio))];
  const idsGruppi = [...new Set(eseguite.map((o) => o.gruppoId).filter((x): x is string => Boolean(x)))];

  const condCampagne: Array<Record<string, unknown>> = [];
  if (idsCampagne.length) condCampagne.push({ id: { in: idsCampagne } });
  if (nomiCampagne.length) condCampagne.push({ nome: { in: nomiCampagne } });
  const campagne = condCampagne.length
    ? await prisma.campagna.findMany({
        where: { OR: condCampagne },
        select: { id: true, nome: true, account: true, idEsterno: true, statoPiattaforma: true, budgetGiornaliero: true },
      })
    : [];
  const campagnaPerId = new Map(campagne.map((c) => [c.id, c]));
  const campagnaPerNome = new Map(campagne.map((c) => [c.nome, c]));
  const campagnaDi = (o: OperazioneAdv) =>
    (o.campagnaId ? campagnaPerId.get(o.campagnaId) : undefined) ?? campagnaPerNome.get(o.bersaglio) ?? null;

  const gruppi = idsGruppi.length
    ? await prisma.gruppo.findMany({
        where: { id: { in: idsGruppi } },
        select: { id: true, nome: true, statoPiattaforma: true },
      })
    : [];
  const gruppoPerId = new Map(gruppi.map((g) => [g.id, g]));

  // Le keyword: per id di piattaforma quando l'operazione ce l'ha, altrimenti
  // per (campagna, testo). Il testo in archivio porta la corrispondenza
  // attaccata («torte roma (phrase)»), quindi si cerca per prefisso e si
  // filtra in memoria sul confine di parola: «torte roma» non deve prendere
  // «torte roma online».
  const opKeyword = eseguite.filter((o) => ["pausa_keyword", "attiva_keyword", "nuova_keyword"].includes(o.tipo));
  const condKeyword: Array<Record<string, unknown>> = [];
  // ⚠️ Solo gli id nel formato completo: un numero nudo qui è l'id della
  // CAMPAGNA (vedi `idCriterioCompleto`), e cercarlo fra le keyword
  // aggancerebbe la riga sbagliata o nessuna.
  const idsKeyword = [...new Set(opKeyword.map((o) => o.idEsterno).filter(idCriterioCompleto))] as string[];
  if (idsKeyword.length) condKeyword.push({ idEsterno: { in: idsKeyword } });
  for (const o of opKeyword) {
    const testo = testoOperazione(o);
    const nome = campagnaDi(o)?.nome ?? o.bersaglio;
    if (testo && nome) condKeyword.push({ campagna: nome, testo: { startsWith: testo, mode: "insensitive" } });
  }
  const righeKeyword = condKeyword.length
    ? await prisma.copyAnnuncio.findMany({
        where: { tipo: "keyword", OR: condKeyword },
        select: { idEsterno: true, campagna: true, gruppo: true, testo: true, statoPiattaforma: true },
      })
    : [];

  // Le consegne dopo la più vecchia esecuzione, per gli account coinvolti.
  const conti = [
    ...new Set(
      eseguite.map((o) => o.account ?? campagnaDi(o)?.account ?? null).filter((x): x is string => Boolean(x))
    ),
  ];
  const piuVecchia = eseguite.reduce<Date>((min, o) => (o.eseguitaIl! < min ? o.eseguitaIl! : min), eseguite[0].eseguitaIl!);
  const consegne: Consegna[] = conti.length
    ? (
        await prisma.ricezioneDati.findMany({
          where: {
            fonte: "google_ads",
            account: { in: conti },
            tipo: { in: [...new Set(Object.values(CONSEGNA_CHE_FA_FEDE))] },
            ricevutoIl: { gt: piuVecchia },
          },
          select: { account: true, tipo: true, ricevutoIl: true },
          orderBy: { ricevutoIl: "asc" },
        })
      ).filter((c): c is Consegna => Boolean(c.account))
    : [];

  // ⚠️⚠️ SOLO L'ULTIMA OPERAZIONE SU UN BERSAGLIO PUÒ ESSERE GIUDICATA.
  //
  // Il confronto è fra il valore che Google ha rimandato **oggi** e quello che
  // l'operazione voleva mettere. Se dopo quell'operazione un'ALTRA ha toccato
  // la stessa cosa, il valore di oggi parla dell'ultima, non di questa: dirla
  // «smentita» è falso. Misurato provandola (17/08): 9 righe su 9 «smentite»
  // erano di questa specie — quattro budget cambiati più volte sulla stessa
  // campagna, e cinque keyword messe in pausa il 04/08 e **riattivate**
  // l'11/08 da un'operazione approvata apposta. La conferma era giusta, era
  // sbagliata la domanda.
  //
  // Contano solo le ESEGUITE: una in coda o approvata non ha cambiato niente
  // su Google, quindi non copre quella prima. E resta il limite dichiarato:
  // una mano umana dentro Google Ads non lascia traccia qui — per questo la
  // frase di «smentita» dice sempre «o non è passata, o è stata cambiata dopo».
  const ultimaPerBersaglio = new Map<string, { id: string; quando: number }>();
  for (const o of eseguite) {
    const k = chiaveBersaglio(o, campagnaDi(o)?.nome);
    if (!k) continue;
    const quando = o.eseguitaIl!.getTime();
    const attuale = ultimaPerBersaglio.get(k);
    if (!attuale || quando > attuale.quando) ultimaPerBersaglio.set(k, { id: o.id, quando });
  }

  // ── Il verdetto, operazione per operazione ─────────────────────────────
  for (const o of eseguite) {
    const k = chiaveBersaglio(o, campagnaDi(o)?.nome);
    const ultima = k ? ultimaPerBersaglio.get(k) : undefined;
    if (ultima && ultima.id !== o.id) {
      esito.set(o.id, {
        stato: "superata",
        etichetta: "Superata da un'altra",
        frase:
          "Dopo questa, un'altra operazione ha toccato la stessa cosa: quello che Google riporta oggi parla di quella, non di questa. " +
          "Per sapere com'era andata bisognava guardarlo allora — l'app tiene il dato di adesso, non la storia di quel campo.",
        quando: null,
      });
      continue;
    }
    esito.set(o.id, verdetto(o, { campagnaDi, gruppoPerId, righeKeyword, consegne }));
  }
  return esito;
}

/**
 * Cosa tocca un'operazione, per capire quale la supera. Due operazioni con la
 * stessa chiave si contendono lo stesso campo: vale l'ultima eseguita.
 *
 * ⚠️ `nuova_campagna` ha una chiave sua e non è mai superata da un cambio di
 * budget: «esiste o no» resta vero anche se poi la campagna cambia.
 */
function chiaveBersaglio(o: OperazioneAdv, nomeCampagna?: string | null): string | null {
  const campagna = o.campagnaId ?? nomeCampagna ?? o.bersaglio;
  switch (o.tipo) {
    case "nuova_campagna":
      return `campagna-esiste:${campagna}`;
    case "budget":
      return `budget:${campagna}`;
    case "pausa_campagna":
    case "attiva_campagna":
      return `stato-campagna:${campagna}`;
    case "pausa_gruppo":
    case "attiva_gruppo":
      return o.gruppoId ? `stato-gruppo:${o.gruppoId}` : null;
    case "pausa_keyword":
    case "attiva_keyword":
    case "nuova_keyword":
      // ⚠️⚠️ **Campagna + testo, e BASTA**: niente `idEsterno`, niente gruppo.
      // Due trappole pagate provandola, tutte e due dello stesso tipo — la
      // chiave si spaccava in due per la stessa parola:
      //  1. `OperazioneAdv.idEsterno` su una `nuova_keyword` porta l'id della
      //     CAMPAGNA (tutte e 15 le «torte roma/torino/…» hanno `22499642385`,
      //     che è `[Cakedesign] | Sales | ITA`): ovvio, la keyword non esiste
      //     ancora quando l'operazione nasce. Fidandosene, quindici parole
      //     diverse diventavano un bersaglio solo.
      //  2. La stessa keyword può portare l'id **completo** su un'operazione e
      //     il **numero nudo** su un'altra (`…:154305705033:381244836363` la
      //     pausa del 04/08, `381244836363` la riattivazione dell'11/08 —
      //     l'eredità del difetto degli id chiuso l'08/08). Chiavi diverse, e
      //     la riattivazione non copriva più la pausa: la pausa risultava
      //     «smentita da Google» quando invece era stata **disfatta da noi**.
      // Il gruppo è fuori per la stessa ragione: le operazioni vecchie non lo
      // portano, le nuove sì, e un campo presente solo a volte spacca la
      // chiave esattamente come un id in due formati.
      // ⚠️ Il prezzo è dichiarato: la stessa parola in due gruppi della stessa
      // campagna diventa un bersaglio solo, e la seconda operazione copre la
      // prima. Si perde un verdetto, **non** si accusa a torto — ed è il verso
      // giusto in cui sbagliare.
      return `keyword:${campagna}|${(testoOperazione(o) ?? "").toLowerCase()}`;
    default:
      return null;
  }
}

/**
 * Un id che è **certamente** di un criterio keyword: `account:gruppo:criterio`.
 *
 * ⚠️ Un numero nudo NON basta. Può essere l'id vecchio di una keyword (il 60%
 * dell'archivio l'aveva fino all'08/08) **oppure** l'id di una campagna, che è
 * quello che `OperazioneAdv.idEsterno` porta sulle `nuova_keyword`. Due cose
 * diverse nella stessa forma: nel dubbio si guarda il testo, che non mente.
 */
function idCriterioCompleto(v: string | null | undefined): boolean {
  return /^[\d-]+:\d+:.+$/.test(v ?? "");
}

function testoOperazione(o: OperazioneAdv): string | null {
  const p = parametri(o);
  const t = typeof p.testo === "string" && p.testo ? p.testo : o.bersaglio;
  const pulito = testoKeywordPulito(String(t ?? "")).trim();
  return pulito || null;
}

function parametri(o: OperazioneAdv): Record<string, unknown> {
  if (!o.parametri) return {};
  try {
    return JSON.parse(o.parametri) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type Contesto = {
  campagnaDi: (o: OperazioneAdv) => { id: string; nome: string; account: string | null; idEsterno: string | null; statoPiattaforma: string | null; budgetGiornaliero: number | null } | null;
  gruppoPerId: Map<string, { id: string; nome: string; statoPiattaforma: string | null }>;
  righeKeyword: Array<{ idEsterno: string | null; campagna: string; gruppo: string | null; testo: string; statoPiattaforma: string | null }>;
  consegne: Consegna[];
};

function verdetto(o: OperazioneAdv, ctx: Contesto): Conferma {
  const eseguitaIl = o.eseguitaIl!;

  if (o.canale !== "google_ads") {
    return {
      stato: "non_verificabile",
      etichetta: "Senza conferma",
      frase: "Su questo canale l'app non riceve un giro di lettura con cui confrontare l'esito: vale la parola dello script.",
      quando: null,
    };
  }

  if (o.tipo === "negativa") {
    const dubbio = /dubbio|non confermat|verificare/i.test(o.esito ?? "");
    return {
      stato: dubbio ? "in_attesa" : "non_verificabile",
      etichetta: dubbio ? "Da controllare" : "Vale la rilettura dello script",
      frase: dubbio
        ? "Lo script ha dichiarato un dubbio nell'esito (qui sopra): la negativa va cercata a mano su Google Ads, l'app non importa le negative."
        : "L'app non importa le keyword negative, quindi non ha un dato indipendente: fa fede la rilettura fatta dallo script prima e dopo (`negativaPresente`), riportata nell'esito.",
      quando: null,
    };
  }

  const tipoConsegna = CONSEGNA_CHE_FA_FEDE[o.tipo];
  if (!tipoConsegna) {
    return {
      stato: "non_verificabile",
      etichetta: "Senza conferma",
      frase: "Per questo tipo di operazione l'app non ha un giro di lettura con cui confrontare l'esito.",
      quando: null,
    };
  }

  const campagna = ctx.campagnaDi(o);
  const account = o.account ?? campagna?.account ?? null;
  if (!account) {
    return {
      stato: "non_verificabile",
      etichetta: "Senza account",
      frase:
        "L'operazione non porta l'account e nemmeno la campagna lo dice: non so quale consegna fa fede. Succede alle operazioni nate prima dell'8/08.",
      quando: null,
    };
  }

  // `subito` = Google ha parlato almeno una volta dopo l'esecuzione (basta a
  // confermare). `tardi` = ha parlato in un giro SUCCESSIVO, non in quello a
  // cavallo dell'esecuzione (serve per smentire: un giro che gira insieme
  // all'esegui può ancora vedere lo stato di partenza).
  // ⚠️ `letta` è la data che si CITA: il valore in archivio viene dall'ultima
  // consegna, non dalla prima.
  const subito = primaConsegnaDopo(ctx.consegne, account, tipoConsegna, eseguitaIl);
  const tardi = primaConsegnaDopo(ctx.consegne, account, tipoConsegna, eseguitaIl, MARGINE_STESSO_GIRO_MS);
  const letta = ultimaConsegnaDopo(ctx.consegne, account, tipoConsegna, eseguitaIl) ?? subito;
  const cosa = ETICHETTA_CONSEGNA[tipoConsegna] ?? tipoConsegna;

  // ── Campagna nuova: esiste? ────────────────────────────────────────────
  if (o.tipo === "nuova_campagna") {
    if (!campagna) {
      return { stato: "non_verificabile", etichetta: "Campagna non trovata", frase: "La campagna dell'operazione non è più nell'app.", quando: null };
    }
    if (campagna.idEsterno || campagna.statoPiattaforma) {
      return {
        stato: "confermata",
        etichetta: "Creata davvero",
        frase: `Google la conosce${campagna.idEsterno ? ` (id ${campagna.idEsterno})` : ""}${
          campagna.statoPiattaforma ? `, stato ${ETICHETTA_STATO_GOOGLE[campagna.statoPiattaforma] ?? campagna.statoPiattaforma}` : ""
        }: il caricamento è andato a buon fine.`,
        quando: letta,
      };
    }
    if (tardi) {
      return {
        stato: "rifiutata",
        etichetta: "Rifiutata da Google",
        frase:
          `L'account ha rimandato ${cosa} il ${dataOra(letta!)}, dopo il lancio, e questa non c'era: il caricamento è stato rifiutato. ` +
          "Il motivo sta solo nel registro dei caricamenti dentro Google Ads (Azioni collettive → Caricamenti). " +
          "Si rimette in coda dall'avviso in cima, dopo aver reincollato lo script corretto.",
        quando: letta,
      };
    }
    if (subito) {
      return {
        stato: "in_attesa",
        etichetta: "Da confermare",
        frase:
          `Il caricamento è asincrono: l'unico elenco arrivato è quello di ${minutiFra(eseguitaIl, subito)} dopo il lancio, e non fa testo. ` +
          "Per saperlo subito guarda il registro caricamenti in Google Ads; altrimenti si saprà al prossimo giro.",
        quando: null,
      };
    }
    return inAttesa(tipoConsegna, eseguitaIl, "Il caricamento è asincrono e nessun elenco campagne è arrivato dopo il lancio.");
  }

  // ── Budget ─────────────────────────────────────────────────────────────
  if (o.tipo === "budget") {
    if (!campagna) {
      return { stato: "non_verificabile", etichetta: "Campagna non trovata", frase: "La campagna dell'operazione non è più nell'app.", quando: null };
    }
    const atteso = Number(parametri(o).budget);
    const attuale = campagna.budgetGiornaliero;
    if (!Number.isFinite(atteso)) {
      return { stato: "non_verificabile", etichetta: "Senza valore", frase: "L'operazione non dice quale budget doveva mettere.", quando: null };
    }
    const combacia = attuale != null && Math.abs(attuale - atteso) < 0.005;
    if (subito && combacia) {
      return { stato: "confermata", etichetta: "Confermata da Google", frase: `Google conferma ${euro(atteso)} (letto il ${dataOra(letta!)}).`, quando: subito };
    }
    if (tardi && attuale != null && !combacia) {
      return {
        stato: "smentita",
        etichetta: "Google dice il contrario",
        frase: `Il ${dataOra(letta!)} Google riportava ${euro(attuale)}, non ${euro(atteso)}: quasi sempre vuol dire che qualcuno l'ha cambiato dopo in Google Ads; se non è così, l'operazione non è passata. Controllare in Google Ads.`,
        quando: letta,
      };
    }
    if (subito) {
      return inAttesa(tipoConsegna, eseguitaIl, `Il giro subito dopo l'esecuzione riportava ancora ${attuale != null ? euro(attuale) : "il valore vecchio"}: può essere solo la lettura dello stesso giro.`);
    }
    return inAttesa(tipoConsegna, eseguitaIl);
  }

  // ── Stato di campagna / gruppo / keyword ───────────────────────────────
  const atteso = o.tipo.startsWith("pausa_") ? "PAUSED" : o.tipo.startsWith("attiva_") ? "ENABLED" : null;

  if (o.tipo === "pausa_campagna" || o.tipo === "attiva_campagna") {
    if (!campagna) {
      return { stato: "non_verificabile", etichetta: "Campagna non trovata", frase: "La campagna dell'operazione non è più nell'app.", quando: null };
    }
    return verdettoStato(campagna.statoPiattaforma, atteso!, subito, tardi, letta, tipoConsegna, eseguitaIl, "la campagna");
  }

  if (o.tipo === "pausa_gruppo" || o.tipo === "attiva_gruppo") {
    const g = o.gruppoId ? ctx.gruppoPerId.get(o.gruppoId) : undefined;
    if (!g) {
      return { stato: "non_verificabile", etichetta: "Gruppo non trovato", frase: "Il gruppo dell'operazione non è più nell'app.", quando: null };
    }
    return verdettoStato(g.statoPiattaforma, atteso!, subito, tardi, letta, tipoConsegna, eseguitaIl, "il gruppo");
  }

  // Keyword: le righe di QUESTA parola in QUESTA campagna (per id se c'è).
  const testo = testoOperazione(o);
  const nomeCampagna = campagna?.nome ?? o.bersaglio;
  const p = parametri(o);
  const matchChiesto = normalizzaMatch(p.corrispondenza);
  const gruppoChiesto = typeof p.gruppo === "string" && p.gruppo ? p.gruppo.toLowerCase() : null;
  const perId = idCriterioCompleto(o.idEsterno) ? ctx.righeKeyword.filter((r) => r.idEsterno === o.idEsterno) : [];
  const perTesto = testo
    ? ctx.righeKeyword.filter((r) => {
        if (r.campagna !== nomeCampagna) return false;
        const t = r.testo.toLowerCase();
        const w = testo.toLowerCase();
        return t === w || t.startsWith(w + " (");
      })
    : [];
  let righe = perId.length ? perId : perTesto;
  // Se l'operazione dice il gruppo, si guarda solo lì (la stessa parola può
  // stare in più gruppi con stati diversi); se nel gruppo non c'è, si torna a
  // tutte le righe della campagna e lo si dice.
  if (gruppoChiesto && righe.some((r) => (r.gruppo ?? "").toLowerCase() === gruppoChiesto)) {
    righe = righe.filter((r) => (r.gruppo ?? "").toLowerCase() === gruppoChiesto);
  }

  if (o.tipo === "nuova_keyword") {
    // Le righe keyword nascono SOLO dagli import: se c'è una riga con l'id di
    // piattaforma, è Google che l'ha nominata.
    const conId = righe.filter((r) => r.idEsterno);
    if (conId.length) {
      const matchTrovati = [...new Set(conId.map((r) => normalizzaMatch(r.testo.match(/\(([^()]*)\)\s*$/)?.[1] ?? null)).filter(Boolean))] as string[];
      const stessoMatch = !matchChiesto || matchTrovati.length === 0 || matchTrovati.includes(matchChiesto);
      if (!stessoMatch) {
        return {
          stato: "smentita",
          etichetta: "Su Google, ma diversa",
          frase: `Su Google la parola c'è, ma con corrispondenza ${matchTrovati.map((m) => ETICHETTA_MATCH[m] ?? m).join("/")} e non ${ETICHETTA_MATCH[matchChiesto!] ?? matchChiesto}. Controllare in Google Ads.`,
          quando: letta,
        };
      }
      const stati = [...new Set(conId.map((r) => r.statoPiattaforma).filter(Boolean))] as string[];
      return {
        stato: "confermata",
        etichetta: "Su Google",
        frase:
          `Google la riporta fra le keyword di «${nomeCampagna}»${conId[0].gruppo ? ` (gruppo ${conId[0].gruppo})` : ""}` +
          `${stati.length ? `, stato ${stati.map((s) => ETICHETTA_STATO_GOOGLE[s] ?? s).join("/")}` : ""}.`,
        quando: letta,
      };
    }
    if (tardi) {
      return {
        stato: "smentita",
        etichetta: "Non risulta su Google",
        frase: `${cosa[0].toUpperCase() + cosa.slice(1)} del ${dataOra(letta!)}, arrivato dopo l'esecuzione, non contiene «${testo}» in «${nomeCampagna}»: la keyword non risulta creata. Controllare in Google Ads.`,
        quando: letta,
      };
    }
    return inAttesa(tipoConsegna, eseguitaIl, `Nell'archivio non c'è ancora una riga di Google per «${testo}».`);
  }

  // pausa_keyword / attiva_keyword
  if (righe.length === 0) {
    return {
      stato: "non_verificabile",
      etichetta: "Keyword non trovata",
      frase: `Nell'archivio non c'è una riga per «${testo}» in «${nomeCampagna}»: non ho con cosa confrontare l'esito.`,
      quando: null,
    };
  }
  const ok = righe.filter((r) => r.statoPiattaforma === atteso).length;
  const attesoLeggibile = ETICHETTA_STATO_GOOGLE[atteso!] ?? atteso!;
  if (subito && ok === righe.length) {
    return {
      stato: "confermata",
      etichetta: "Confermata da Google",
      frase: `Google riporta «${testo}» ${attesoLeggibile}${righe.length > 1 ? ` (${righe.length} criteri)` : ""}, letto il ${dataOra(letta!)}.`,
      quando: letta,
    };
  }
  if (tardi && ok < righe.length) {
    const altri = [...new Set(righe.filter((r) => r.statoPiattaforma !== atteso).map((r) => ETICHETTA_STATO_GOOGLE[r.statoPiattaforma ?? ""] ?? r.statoPiattaforma ?? "sconosciuto"))];
    return {
      stato: "smentita",
      etichetta: "Google dice il contrario",
      frase: `${cosa[0].toUpperCase() + cosa.slice(1)} del ${dataOra(letta!)} riporta «${testo}» ${altri.join("/")}, non ${attesoLeggibile}${righe.length > 1 ? ` (${righe.length - ok} su ${righe.length})` : ""}: quasi sempre vuol dire che qualcuno l'ha cambiata dopo in Google Ads; se non è così, l'operazione non è passata. Controllare in Google Ads.`,
      quando: letta,
    };
  }
  if (subito) {
    return inAttesa(tipoConsegna, eseguitaIl, "Il giro subito dopo l'esecuzione riportava ancora lo stato di partenza: può essere solo la lettura dello stesso giro.");
  }
  return inAttesa(tipoConsegna, eseguitaIl);
}

function verdettoStato(
  attuale: string | null,
  atteso: string,
  subito: Date | null,
  tardi: Date | null,
  letta: Date | null,
  tipoConsegna: string,
  eseguitaIl: Date,
  soggetto: string
): Conferma {
  const attesoLeggibile = ETICHETTA_STATO_GOOGLE[atteso] ?? atteso;
  if (subito && attuale === atteso) {
    return { stato: "confermata", etichetta: "Confermata da Google", frase: `Google riporta ${soggetto} ${attesoLeggibile} (letto il ${dataOra(letta!)}).`, quando: subito };
  }
  if (tardi && attuale && attuale !== atteso) {
    return {
      stato: "smentita",
      etichetta: "Google dice il contrario",
      frase: `Il ${dataOra(letta!)} Google riportava ${soggetto} ${ETICHETTA_STATO_GOOGLE[attuale] ?? attuale}, non ${attesoLeggibile}: quasi sempre vuol dire che qualcuno l'ha cambiato dopo in Google Ads; se non è così, l'operazione non è passata. Controllare in Google Ads.`,
      quando: letta,
    };
  }
  if (subito) {
    return inAttesa(tipoConsegna, eseguitaIl, `Il giro subito dopo l'esecuzione riportava ancora ${soggetto} ${attuale ? ETICHETTA_STATO_GOOGLE[attuale] ?? attuale : "com'era"}: può essere solo la lettura dello stesso giro.`);
  }
  return inAttesa(tipoConsegna, eseguitaIl);
}

function minutiFra(a: Date, b: Date): string {
  const s = Math.round((b.getTime() - a.getTime()) / 1000);
  if (s < 90) return `${s} secondi`;
  return `${Math.round(s / 60)} minuti`;
}

/** Colore della pillola, per stato: solo i due estremi accendono un colore forte. */
export const COLORE_CONFERMA: Record<StatoConferma, string> = {
  confermata: "var(--green)",
  in_attesa: "var(--blue)",
  smentita: "var(--red)",
  rifiutata: "var(--red)",
  superata: "var(--text-tertiary)",
  non_verificabile: "var(--text-tertiary)",
};
