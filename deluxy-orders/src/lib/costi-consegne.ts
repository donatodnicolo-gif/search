// IL COSTO DEL FORNITORE PRESO DALLE CONSEGNE, cercate per DDT.
//
// Richiesta dell'utente (05/09/2026): «importa dal prezzo partner dato da app
// delivery con ricerca sulla base di DDT pari a id dell'ordine per
// piattaforma».
//
// PERCHÉ SERVE, ANCHE SE UN RITIRO C'È GIÀ. `piattaforma.ts` adotta il costo
// dalle VENDITE (`costoPartner`), ma solo quando la vendita è `accettata` e
// solo per gli ordini che la piattaforma ha davvero smistato. Restano fuori
// tutte le consegne che esistono senza una vendita viva: quelle importate dal
// legacy, quelle create a mano dall'ufficio, quelle la cui vendita è stata
// chiusa. Il DDT è il ponte verso quelle.
//
// ⭐ PERCHÉ IL DDT È L'ID DELL'ORDINE. Non è una convenzione nostra: è la
// piattaforma che lo scrive. In `api/src/sales/sales.module.ts`, quando il
// partner accetta e nasce la consegna:
//
//     const numeroDdt = vendita.externalOrderId?.trim() || null;
//
// e `externalOrderId`, per le vendite con `source = deluxy-orders`, è
// esattamente l'id dell'ordine di qui — lo stesso `riferimentoEsterno` che usa
// il ritiro dalle vendite. Il commento accanto dice che nei dati veri è così su
// 10.515 consegne su 12.967 con un DDT (l'81%).
//
// ⚠️⚠️ QUALE NUMERO SI PRENDE — è la decisione che vale i soldi.
// Si prende `economiaPartner.valoreProdotti`, che la piattaforma documenta come
// «quanto vale la merce PER IL PARTNER» (`api/src/common/valore-prodotti.ts`:
// la cascata dei ripieghi antepone il prezzo partner a quello al pubblico, e la
// fatturazione usa la somma delle righe, non il campo `productValue`).
//
// NON si prende `economiaPartner.prezzoTotale` (`price + plus + regole`), che
// sembra il candidato naturale e sarebbe il denaro AL CONTRARIO: quello è ciò
// che Deluxy FATTURA al partner per il servizio di consegna — lo dice il
// modello `Invoice` della piattaforma, «somma di price + additionalPrice delle
// consegne billable ed effettuate». Metterlo in `costoFornitore` farebbe
// sembrare un incasso un costo, e il margine di quegli ordini sarebbe
// inventato. Fra l'altro, sulle consegne nate da una vendita D2C `price` non
// viene nemmeno scritto.
//
// ⚠️ NON è una seconda fonte di verità sul costo: è lo stesso costo, preso
// dalla stessa casa (la piattaforma), per una porta diversa. Vale la regola di
// sempre — LA MANO BATTE IL RITIRO: se `costoFornitore` c'è già, questo modulo
// non lo tocca, chiunque l'abbia scritto.

import { prisma } from "./db";
import { configurazionePiattaforma } from "./piattaforma";

/** Da dove è arrivato il costo, quando lo scrive questo modulo. */
export const COSTO_DA_CONSEGNA = "consegna";

/**
 * Stati che dicono «questa consegna non è mai avvenuta»: la merce non è stata
 * comprata e non si deve niente a nessuno.
 * ⚠️ Elenco NEGATIVO e corto di proposito: uno stato nuovo della piattaforma
 * entra nel conto invece di sparirci, e lo si vede nel riepilogo.
 * ⚠️ `not_delivered` NON è qui: la consegna non è arrivata al destinatario, ma
 * il fiorista il mazzo l'aveva preparato — quel costo esiste. Si contano a
 * parte per poterle guardare.
 */
const STATI_NULLI = new Set(["cancelled", "not_accepted", "invalidated"]);

/** Un id di Orders è un cuid: 'c' seguito da lettere e cifre minuscole. */
const PARE_UN_ID = /^c[a-z0-9]{20,}$/;

type ConsegnaApi = {
  id: string;
  numero: number | null;
  stato: string | null;
  data: string | null;
  partner: { id: string; insegna: string | null } | null;
  economiaPartner: { valoreProdotti: number | null } | null;
  ordine: { ddt: string | null; ddtBrand: string | null; numeroShopify: string | null } | null;
  aggiornataIl: string;
};

type Candidato = {
  ordineId: string;
  etichetta: string;
  valore: number;
  partner: string | null;
  /** Quante consegne hanno contribuito: più di una è un caso da guardare. */
  consegne: number;
  via: "ddt-id" | "ddt-numero";
  statiNonConsegnati: number;
};

export type EsitoCostiConsegne = {
  /** Solo lettura: nessuna riga toccata. */
  prova: boolean;
  consegneLette: number;
  conDdt: number;
  senzaDdt: number;
  /** DDT che non corrisponde a nessun ordine di qui. */
  ddtSenzaOrdine: number;
  /** DDT numerico che corrisponde a PIÙ ordini: non si indovina. */
  ddtAmbigui: number;
  /** Consegne scartate perché annullate/non accettate/invalidate. */
  consegneNulle: number;
  /** Consegne il cui valore merce è zero o assente. */
  valoreAssente: number;
  /** Ordini che avevano già un costo: non si tocca (la mano batte il ritiro). */
  costoGiaDeciso: number;
  /** Ordini con PIÙ consegne: saltati, vanno guardati a mano. */
  ordiniConPiuConsegne: number;
  /** Ordini che riceverebbero (o hanno ricevuto) il costo. */
  ordiniDaScrivere: number;
  euroDaScrivere: number;
  scritti: number;
  /** Un assaggio, per guardare i numeri prima di fidarsi. */
  esempi: Array<{ ordine: string; euro: number; partner: string | null; via: string }>;
  /** Gli ordini con più consegne, elencati: sono quelli da decidere. */
  daGuardare: Array<{ ordine: string; euro: number; consegne: number }>;
  errore?: string;
};

/**
 * Legge le consegne dalla piattaforma e ne ricava il costo del fornitore per
 * gli ordini di qui.
 *
 * ⚠️ `scrivi` è FALSO per definizione: questo tocca il denaro di 14.000 ordini,
 * e la prima cosa che deve fare è FAR VEDERE i numeri, non scriverli. Lo
 * script `npm run costi:consegne` gira in prova; scrive solo con `--scrivi`.
 */
export async function costiDalleConsegne(opzioni: {
  scrivi?: boolean;
  /** Solo le consegne aggiornate dopo questo istante (ISO). Vuoto = tutte. */
  da?: string;
  /** Tetto di sicurezza sui giri di pagina. */
  giriMax?: number;
} = {}): Promise<EsitoCostiConsegne> {
  const esito: EsitoCostiConsegne = {
    prova: !opzioni.scrivi,
    consegneLette: 0,
    conDdt: 0,
    senzaDdt: 0,
    ddtSenzaOrdine: 0,
    ddtAmbigui: 0,
    consegneNulle: 0,
    valoreAssente: 0,
    costoGiaDeciso: 0,
    ordiniConPiuConsegne: 0,
    ordiniDaScrivere: 0,
    euroDaScrivere: 0,
    scritti: 0,
    esempi: [],
    daGuardare: [],
  };

  const conf = configurazionePiattaforma();
  if (!conf) {
    esito.errore =
      "Piattaforma non configurata: servono PLATFORM_URL e PLATFORM_API_KEY (chiave da api/scripts/crea-chiave-app.mjs della piattaforma).";
    return esito;
  }

  // ── 1. Si leggono le consegne, e si tiene solo quello che serve ──────────
  // Chiave della mappa: l'ordine di qui. Valore: il costo messo insieme.
  const perOrdine = new Map<string, Candidato>();
  // Cache delle risoluzioni DDT → ordine: lo stesso DDT torna su più consegne.
  const risolti = new Map<string, { id: string; etichetta: string; via: Candidato["via"] } | null>();

  const LIMITE = 500;
  let da = opzioni.da;
  const giriMax = opzioni.giriMax ?? 200;

  try {
    for (let giro = 0; giro < giriMax; giro++) {
      const p = new URLSearchParams({ limit: String(LIMITE) });
      if (da) p.set("aggiornateDa", da);
      const res = await fetch(`${conf.url}/api/v1/app/consegne?${p}`, {
        headers: { "x-api-key": conf.chiave },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const testo = await res.text().catch(() => "");
        throw new Error(
          `La piattaforma ha risposto ${res.status}${testo ? `: ${testo.slice(0, 200)}` : ""}`,
        );
      }
      const corpo = (await res.json()) as { consegne?: ConsegnaApi[] };
      const righe = corpo.consegne ?? [];
      if (righe.length === 0) break;

      for (const c of righe) {
        esito.consegneLette++;
        da = c.aggiornataIl;

        const ddt = c.ordine?.ddt?.trim();
        if (!ddt) {
          esito.senzaDdt++;
          continue;
        }
        esito.conDdt++;

        const stato = (c.stato ?? "").toLowerCase();
        if (STATI_NULLI.has(stato)) {
          esito.consegneNulle++;
          continue;
        }

        const valore = c.economiaPartner?.valoreProdotti ?? 0;
        if (!(valore > 0)) {
          esito.valoreAssente++;
          continue;
        }

        const chiaveCache = `${ddt} ${c.ordine?.ddtBrand ?? ""}`;
        let trovato = risolti.get(chiaveCache);
        if (trovato === undefined) {
          trovato = await risolviDdt(ddt, c.ordine?.ddtBrand ?? null, esito);
          risolti.set(chiaveCache, trovato);
        }
        if (!trovato) continue;

        const gia = perOrdine.get(trovato.id);
        if (gia) {
          gia.valore += valore;
          gia.consegne++;
          if (stato === "not_delivered") gia.statiNonConsegnati++;
        } else {
          perOrdine.set(trovato.id, {
            ordineId: trovato.id,
            etichetta: trovato.etichetta,
            valore,
            partner: c.partner?.insegna ?? null,
            consegne: 1,
            via: trovato.via,
            statiNonConsegnati: stato === "not_delivered" ? 1 : 0,
          });
        }
      }

      // ⚠️ La pagina successiva riparte da `aggiornateDa = ultima vista`, e la
      // piattaforma filtra con `updatedAt > da`: se 500 consegne condividessero
      // il millesimo di secondo, quelle in coda alla pagina resterebbero fuori.
      // È lo stesso patto del ritiro delle vendite, e sull'archivio vero non
      // succede — ma è il motivo per cui questo modulo si può rilanciare a
      // vuoto senza danni, ed è il primo posto dove guardare se un ordine non
      // prende il costo che dovrebbe.
      if (righe.length < LIMITE) break;
    }
  } catch (e) {
    esito.errore = (e as Error).message;
    return esito;
  }

  if (perOrdine.size === 0) return esito;

  // ── 2. Si scarta chi ha già un costo, e chi ha più di una consegna ───────
  // ⚠️ Più consegne sullo stesso ordine NON si sommano in automatico. Due
  // consegne possono essere due spedizioni vere (e allora la somma è giusta)
  // oppure la stessa consegna rifatta (e allora la somma è il doppio del
  // dovuto). Il dato non dice quale delle due: si dichiarano e le guarda una
  // persona, invece di scrivere un numero che potrebbe essere doppio.
  const ids = [...perOrdine.keys()];
  const esistenti = await prisma.ordine.findMany({
    where: { id: { in: ids } },
    select: { id: true, costoFornitore: true },
  });
  const conCosto = new Set(esistenti.filter((o) => o.costoFornitore != null).map((o) => o.id));

  const daScrivere: Candidato[] = [];
  for (const c of perOrdine.values()) {
    if (conCosto.has(c.ordineId)) {
      esito.costoGiaDeciso++;
      continue;
    }
    if (c.consegne > 1) {
      esito.ordiniConPiuConsegne++;
      if (esito.daGuardare.length < 30) {
        esito.daGuardare.push({ ordine: c.etichetta, euro: r2(c.valore), consegne: c.consegne });
      }
      continue;
    }
    daScrivere.push(c);
  }

  esito.ordiniDaScrivere = daScrivere.length;
  esito.euroDaScrivere = r2(daScrivere.reduce((s, c) => s + c.valore, 0));
  esito.esempi = daScrivere
    .slice(0, 15)
    .map((c) => ({ ordine: c.etichetta, euro: r2(c.valore), partner: c.partner, via: c.via }));

  if (!opzioni.scrivi) return esito;

  // ── 3. Si scrive, uno per uno, e si lascia detto nella storia dell'ordine ─
  for (const c of daScrivere) {
    await prisma.ordine.update({
      where: { id: c.ordineId },
      data: {
        costoFornitore: r2(c.valore),
        costoFornitoreNome: c.partner,
        costoIl: new Date(),
        costoDa: COSTO_DA_CONSEGNA,
      },
    });
    await prisma.eventoOrdine.create({
      data: {
        ordineId: c.ordineId,
        tipo: "sync",
        descrizione:
          `Costo fornitore ${r2(c.valore).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} ` +
          `preso dalla consegna sulla piattaforma${c.partner ? ` (${c.partner})` : ""}, ` +
          `trovata col DDT ${c.via === "ddt-id" ? "uguale all'id dell'ordine" : "uguale al numero d'ordine"}. ` +
          `È il valore della merce per il partner, non il prezzo della consegna.`,
        autore: "piattaforma",
      },
    });
    esito.scritti++;
  }

  return esito;
}

/**
 * Da un DDT all'ordine di qui.
 *
 * Due strade, e la seconda è volutamente diffidente:
 *  · il DDT è l'ID dell'ordine → è la strada che la piattaforma scrive da sé,
 *    e un id non è ambiguo;
 *  · il DDT è un NUMERO d'ordine (le consegne vecchie, importate dal legacy) →
 *    ⚠️ lo stesso numero esiste su brand diversi. Lo dice la piattaforma stessa
 *    nello schema: «il DDT 3749 sta su 16 consegne di 8 partner». Si accetta
 *    SOLO se, brand compreso, corrisponde a UN ordine e uno solo. Se sono due,
 *    si conta come ambiguo e non si sceglie: un costo attaccato all'ordine
 *    sbagliato è peggio di un costo mancante, perché non si vede.
 *
 * ⚠️ QUANTO SERVE QUESTA DIFFIDENZA, misurato sul registro il 05/09/2026:
 * su 14.577 ordini ci sono 11.873 numeri distinti, e **1.872 numeri vivono su
 * più di un brand — cioè 4.576 ordini, il 31,4%**. Senza il brand, un DDT
 * numerico su tre attaccherebbe il costo a un ordine plausibile e sbagliato.
 */
async function risolviDdt(
  ddt: string,
  ddtBrand: string | null,
  esito: EsitoCostiConsegne,
): Promise<{ id: string; etichetta: string; via: Candidato["via"] } | null> {
  if (PARE_UN_ID.test(ddt)) {
    const o = await prisma.ordine.findUnique({
      where: { id: ddt },
      select: { id: true, numero: true, brand: true },
    });
    if (!o) {
      esito.ddtSenzaOrdine++;
      return null;
    }
    return { id: o.id, etichetta: `${o.brand} ${o.numero}`, via: "ddt-id" };
  }

  // Numero d'ordine: «3749» e «#3749» sono lo stesso ordine.
  const nudo = ddt.replace(/^#/, "");
  if (!/^\d+$/.test(nudo)) {
    esito.ddtSenzaOrdine++;
    return null;
  }
  const candidati = await prisma.ordine.findMany({
    where: {
      OR: [{ numero: nudo }, { numero: `#${nudo}` }],
      ...(ddtBrand ? { brand: { equals: ddtBrand, mode: "insensitive" } } : {}),
    },
    select: { id: true, numero: true, brand: true },
    take: 5,
  });
  if (candidati.length === 0) {
    esito.ddtSenzaOrdine++;
    return null;
  }
  if (candidati.length > 1) {
    esito.ddtAmbigui++;
    return null;
  }
  const o = candidati[0];
  return { id: o.id, etichetta: `${o.brand} ${o.numero}`, via: "ddt-numero" };
}

/** Due decimali: gli importi si scrivono come si leggono. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
