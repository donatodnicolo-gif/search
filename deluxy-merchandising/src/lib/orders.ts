// Ponte verso Deluxy Orders, il registro centralizzato degli ordini Shopify.
//
// Merchandising non parla con Shopify per sapere cosa si è venduto: lo chiede a
// Orders, che è la fonte di verità degli ordini di tutti i brand. Da lì
// arrivano le righe d'ordine (titolo, sku, quantità, prezzo) che diventano
// Vendita, il fatto su cui poggiano trend e ipotesi di ordinativo.
//
// Due cose importanti, ereditate dal contratto di Orders:
// - gli ordini ANNULLATI non escono dalle sue API, quindi qui non entrano mai
//   (un annullato resta spesso "pagato": contarlo gonfierebbe il venduto);
// - le righe non hanno un id proprio, quindi l'identità di una riga è
//   "<idOrdine>#<posizione>": è la chiave con cui l'import non duplica nulla.
//
// Configurazione: ORDERS_URL (default produzione) + ORDERS_API_KEY.

import { cache } from "react";
import { prisma } from "./db";

const BASE_DEFAULT = "https://deluxy-orders.vercel.app";

export function ordersConfigurato(): boolean {
  return Boolean(process.env.ORDERS_API_KEY);
}

export function ordersBase(): string {
  return (process.env.ORDERS_URL || BASE_DEFAULT).replace(/\/$/, "");
}

type RigaOrders = {
  titolo: string;
  variante?: string | null;
  sku?: string | null;
  quantita: number;
  prezzo: number;
};

type OrdineOrders = {
  id: string;
  brand: string;
  numero: string;
  data: string;
  shopify?: {
    financialStatus?: string | null;
    fulfillmentStatus?: string | null;
    annullato?: boolean;
  };
  righe?: RigaOrders[];
};

export type EsitoImport = {
  ok: boolean;
  messaggio: string;
  ordiniLetti: number;
  righeLette: number;
  righeNuove: number;
  righeAbbinate: number;
  /** Righe già in archivio a cui è cambiato lo stato dell'ordine. */
  righeAggiornate: number;
};

// Quante scritture in parallelo. Il Postgres è condiviso con altre cinque app e
// la connection string ha `connection_limit=5`: mandarne di più mette le altre
// in coda finché non scadono i 10 secondi del pooler. Stessa costante, stesso
// motivo, di `shopify-collezioni.ts`.
const SCRITTURE_INSIEME = 5;

// **Il giorno di una vendita è il giorno italiano**, ovunque giri il codice.
// `setHours(0,0,0,0)` tronca nel fuso del server: su Vercel (UTC) un ordine
// delle 00:30 di Roma finiva nel giorno prima, e lo stesso ordine riceveva date
// diverse a seconda che l'import girasse dal PC (Roma) o dal cron (UTC) — con
// `skipDuplicates` la prima data resta per sempre. Deluxy vende in Italia.
import { giornoRoma } from "./fuso";

/** Normalizza un titolo per il confronto: niente accenti, niente punteggiatura. */
function normalizza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // via i segni diacritici scomposti da NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Scarica gli ordini degli ultimi `giorni` da Orders e li trasforma in vendite.
 *
 * L'abbinamento a un prodotto di questa app è, in ordine: SKU della variante,
 * codice del prodotto, nome del prodotto normalizzato. Se nessuno prende, la
 * riga si salva lo stesso con prodotto nullo: sparisce dai trend per prodotto
 * ma non dai totali, e la pagina Vendite la mostra fra le righe da mappare.
 * Indovinare l'abbinamento sarebbe peggio che dichiararlo mancante.
 *
 * Le righe **già in archivio** non si reinseriscono (il riferimento è unico) ma
 * il loro stato **si riallinea**: vedi `riallineaStati` qui sotto.
 */
export async function importaVendite(
  giorni = 90,
  opzioni: { automatico?: boolean } = {}
): Promise<EsitoImport> {
  const dal = new Date();
  dal.setDate(dal.getDate() - giorni);
  const al = new Date();

  if (!ordersConfigurato()) {
    return {
      ok: false,
      messaggio: "App Ordini non configurata: manca ORDERS_API_KEY nelle variabili d'ambiente.",
      ordiniLetti: 0,
      righeLette: 0,
      righeNuove: 0,
      righeAbbinate: 0,
      righeAggiornate: 0,
    };
  }

  const chiave = process.env.ORDERS_API_KEY as string;
  const base = ordersBase();

  // Indici di abbinamento, costruiti una volta sola.
  const [varianti, prodotti] = await Promise.all([
    prisma.variante.findMany({ select: { id: true, sku: true, nome: true, prodottoId: true } }),
    prisma.prodotto.findMany({ select: { id: true, codice: true, nome: true } }),
  ]);
  const perSku = new Map<string, { prodottoId: string; varianteId: string }>();
  for (const v of varianti) {
    if (v.sku) perSku.set(v.sku.trim().toLowerCase(), { prodottoId: v.prodottoId, varianteId: v.id });
  }
  const perCodice = new Map<string, string>();
  const perNome = new Map<string, string>();
  for (const p of prodotti) {
    perCodice.set(p.codice.trim().toLowerCase(), p.id);
    perNome.set(normalizza(p.nome), p.id);
  }
  const variantiPerProdotto = new Map<string, { id: string; nome: string }[]>();
  for (const v of varianti) {
    const l = variantiPerProdotto.get(v.prodottoId) ?? [];
    l.push({ id: v.id, nome: v.nome });
    variantiPerProdotto.set(v.prodottoId, l);
  }

  let ordiniLetti = 0;
  let righeLette = 0;
  let righeNuove = 0;
  let righeAbbinate = 0;
  let righeAggiornate = 0;
  const daInserire: {
    data: Date;
    prodottoId: string | null;
    varianteId: string | null;
    titolo: string;
    varianteNome: string | null;
    sku: string | null;
    canale: string;
    statoPagamento: string | null;
    statoEvasione: string | null;
    quantita: number;
    ricavo: number;
    origine: string;
    riferimento: string;
  }[] = [];

  try {
    // Il tetto di pagine è un paracadute, non un limite di progetto: se la
    // finestra ne avesse di più, il taglio va DICHIARATO nell'esito — un import
    // troncato che dice «ok» è la trappola del take sotto l'universo dei dati,
    // già pagata due volte in quest'app.
    const MAX_PAGINE = 40;
    let pagineTotali = 1;
    for (let page = 1; page <= MAX_PAGINE; page++) {
      const q = new URLSearchParams({
        da: dal.toISOString().slice(0, 10),
        page: String(page),
        limit: "200",
      });
      const res = await fetch(`${base}/api/v1/ordini?${q}`, {
        headers: { "x-api-key": chiave },
        signal: AbortSignal.timeout(25000),
        cache: "no-store",
      });
      if (!res.ok) {
        const dettaglio =
          res.status === 401 || res.status === 403
            ? "chiave API non valida o senza permessi"
            : `ha risposto ${res.status}`;
        throw new Error(`L'app Ordini ${dettaglio}.`);
      }
      const corpo = (await res.json().catch(() => ({}))) as { ordini?: OrdineOrders[]; pagine?: number };
      const ordini = corpo.ordini ?? [];
      ordiniLetti += ordini.length;

      for (const o of ordini) {
        const righe = o.righe ?? [];
        for (let i = 0; i < righe.length; i++) {
          const r = righe[i];
          righeLette++;
          const sku = r.sku?.trim() || null;
          let prodottoId: string | null = null;
          let varianteId: string | null = null;

          const perSkuHit = sku ? perSku.get(sku.toLowerCase()) : undefined;
          if (perSkuHit) {
            prodottoId = perSkuHit.prodottoId;
            varianteId = perSkuHit.varianteId;
          } else if (sku && perCodice.has(sku.toLowerCase())) {
            prodottoId = perCodice.get(sku.toLowerCase())!;
          } else {
            const perTitolo = perNome.get(normalizza(r.titolo));
            if (perTitolo) prodottoId = perTitolo;
          }
          // Variante riconosciuta per nome, solo dentro il prodotto già abbinato.
          if (prodottoId && !varianteId && r.variante) {
            const cand = (variantiPerProdotto.get(prodottoId) ?? []).find(
              (v) => normalizza(v.nome) === normalizza(r.variante as string)
            );
            if (cand) varianteId = cand.id;
          }
          if (prodottoId) righeAbbinate++;

          const data = giornoRoma(new Date(o.data));
          daInserire.push({
            data,
            prodottoId,
            varianteId,
            titolo: r.titolo,
            varianteNome: r.variante?.trim() || null,
            sku,
            canale: o.brand,
            statoPagamento: o.shopify?.financialStatus ?? null,
            statoEvasione: o.shopify?.fulfillmentStatus ?? null,
            quantita: r.quantita || 0,
            ricavo: (r.prezzo || 0) * (r.quantita || 0),
            origine: "orders",
            riferimento: `${o.id}#${i}`,
          });
        }
      }
      pagineTotali = corpo.pagine ?? 1;
      if (ordini.length === 0 || page >= pagineTotali) break;
    }
    const troncato = pagineTotali > MAX_PAGINE ? ` ⚠ Letta solo una parte della finestra: ${MAX_PAGINE} pagine su ${pagineTotali} — gli ordini più vecchi non sono entrati, restringi i giorni o rilancia.` : "";

    // createMany + skipDuplicates: il riferimento è unico, quindi rilanciare
    // l'import non crea doppioni e aggiunge solo ciò che manca.
    for (let i = 0; i < daInserire.length; i += 500) {
      const blocco = daInserire.slice(i, i + 500);
      const esito = await prisma.vendita.createMany({ data: blocco, skipDuplicates: true });
      righeNuove += esito.count;
    }

    // ...ma proprio perché salta i doppioni, da solo non riscriverebbe **mai**
    // una riga già presente: un ordine incassato o rimborsato dopo il primo
    // import resterebbe congelato allo stato di allora.
    righeAggiornate = await riallineaStati(daInserire);

    const messaggio =
      righeNuove === 0 && righeAggiornate === 0
        ? `Nessuna novità: le ${righeLette} righe lette erano già in archivio, con lo stesso stato.`
        : [
            righeNuove > 0
              ? `${righeNuove} vendite importate (${righeAbbinate} righe abbinate a un prodotto su ${righeLette} lette).`
              : `Nessuna vendita nuova sulle ${righeLette} righe lette.`,
            righeAggiornate > 0
              ? `${righeAggiornate} righe già in archivio hanno cambiato stato (incassi arrivati dopo, rimborsi, evasioni).`
              : "",
          ]
            .filter(Boolean)
            .join(" ") + troncato;

    await prisma.importVendite.create({
      data: {
        dal,
        al,
        ordiniLetti,
        righeLette,
        righeNuove,
        righeAbbinate,
        righeAggiornate,
        automatico: opzioni.automatico === true,
        esito: "ok",
        messaggio: `${righeNuove} righe nuove e ${righeAggiornate} riallineate su ${righeLette} lette${troncato}`,
      },
    });

    return { ok: true, messaggio, ordiniLetti, righeLette, righeNuove, righeAbbinate, righeAggiornate };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore sconosciuto durante l'import.";
    await prisma.importVendite.create({
      data: {
        dal,
        al,
        ordiniLetti,
        righeLette,
        righeNuove,
        righeAbbinate,
        righeAggiornate,
        automatico: opzioni.automatico === true,
        esito: "errore",
        messaggio,
      },
    });
    return { ok: false, messaggio, ordiniLetti, righeLette, righeNuove, righeAbbinate, righeAggiornate };
  }
}

/**
 * Riporta sulle righe **già in archivio** lo stato che l'ordine ha oggi.
 *
 * È il pezzo che manca a un import fatto di soli `createMany`. Lo stato di
 * pagamento non è una proprietà della riga scritta una volta per sempre: un
 * ordine entra `PENDING` e diventa `PAID` quando il bonifico arriva, o
 * `REFUNDED` quando il cliente restituisce. `FILTRO_BUON_FINE` legge proprio
 * quel campo, quindi senza riallineamento una vendita incassata tre giorni dopo
 * resterebbe **fuori** dalle classifiche per sempre, e un rimborso resterebbe
 * **dentro** — con l'aggravante che sono i numeri su cui l'app decide l'ordine
 * delle vetrine.
 *
 * Si scrive **solo dove qualcosa è davvero cambiato**: si leggono gli stati
 * attuali, si confrontano, e si aggiorna a gruppi di stato uguale. Riscrivere
 * migliaia di righe identiche per trovarne dieci sarebbe lo stesso lavoro per il
 * database e nessuna informazione in più.
 */
async function riallineaStati(
  lette: { riferimento: string; statoPagamento: string | null; statoEvasione: string | null }[]
): Promise<number> {
  if (lette.length === 0) return 0;

  const atteso = new Map(lette.map((r) => [r.riferimento, r]));
  const riferimenti = [...atteso.keys()];

  // Le righe in archivio si leggono a blocchi: un `IN (…)` con migliaia di
  // valori è la trappola già pagata altrove in queste app.
  const cambiate: { riferimento: string; statoPagamento: string | null; statoEvasione: string | null }[] = [];
  for (let i = 0; i < riferimenti.length; i += 500) {
    const presenti = await prisma.vendita.findMany({
      where: { riferimento: { in: riferimenti.slice(i, i + 500) } },
      select: { riferimento: true, statoPagamento: true, statoEvasione: true },
    });
    for (const p of presenti) {
      const nuovo = atteso.get(p.riferimento!);
      if (!nuovo) continue;
      if (p.statoPagamento !== nuovo.statoPagamento || p.statoEvasione !== nuovo.statoEvasione) {
        cambiate.push(nuovo);
      }
    }
  }
  if (cambiate.length === 0) return 0;

  // Le righe cambiate si raggruppano per coppia di stati: di norma sono poche
  // combinazioni (PAID/FULFILLED, REFUNDED/RESTOCKED…), quindi bastano pochi
  // `updateMany` invece di un update per riga.
  const perStato = new Map<string, { pagamento: string | null; evasione: string | null; rif: string[] }>();
  for (const c of cambiate) {
    const chiave = `${c.statoPagamento ?? ""}|${c.statoEvasione ?? ""}`;
    const g = perStato.get(chiave) ?? { pagamento: c.statoPagamento, evasione: c.statoEvasione, rif: [] };
    g.rif.push(c.riferimento);
    perStato.set(chiave, g);
  }

  const lavori: (() => Promise<number>)[] = [];
  for (const g of perStato.values()) {
    for (let i = 0; i < g.rif.length; i += 200) {
      const fetta = g.rif.slice(i, i + 200);
      lavori.push(async () => {
        const esito = await prisma.vendita.updateMany({
          where: { riferimento: { in: fetta } },
          data: { statoPagamento: g.pagamento, statoEvasione: g.evasione },
        });
        return esito.count;
      });
    }
  }

  let aggiornate = 0;
  for (let i = 0; i < lavori.length; i += SCRITTURE_INSIEME) {
    const conti = await Promise.all(lavori.slice(i, i + SCRITTURE_INSIEME).map((f) => f()));
    aggiornate += conti.reduce((a, b) => a + b, 0);
  }
  return aggiornate;
}

/** Ultimo import eseguito (per mostrarne l'esito in pagina). */
export async function ultimoImport() {
  return prisma.importVendite.findFirst({ orderBy: { iniziatoIl: "desc" } });
}

export type Freschezza = {
  /** Giorno dell'ultima vendita in archivio. `null` se non c'è venduto. */
  ultimoGiorno: Date | null;
  /** Quanti giorni fa. */
  giorni: number | null;
  /** Quando è finito l'ultimo import riuscito, e se l'ha fatto il giro notturno. */
  ultimoImportRiuscito: Date | null;
  automatico: boolean;
  /** Oltre questa soglia i numeri non si possono più chiamare "di oggi". */
  vecchio: boolean;
};

/**
 * Da quanto sono fermi i numeri del venduto.
 *
 * Avvolta in `cache()`: la riga di freschezza sta in cima a più pagine e in più
 * punti della stessa pagina, e senza deduplica per richiesta pagherebbe due
 * query ogni volta — su un pool da 5 connessioni si sente.
 */
export const freschezzaVenduto = cache(async function freschezzaVenduto(): Promise<Freschezza> {
  const [aggregato, ultimoOk] = await Promise.all([
    prisma.vendita.aggregate({ _max: { data: true } }),
    prisma.importVendite.findFirst({ where: { esito: "ok" }, orderBy: { iniziatoIl: "desc" } }),
  ]);
  const ultimoGiorno = aggregato._max.data ?? null;
  const giorni = ultimoGiorno
    ? Math.max(0, Math.floor((Date.now() - ultimoGiorno.getTime()) / 86_400_000))
    : null;
  return {
    ultimoGiorno,
    giorni,
    ultimoImportRiuscito: ultimoOk?.iniziatoIl ?? null,
    automatico: ultimoOk?.automatico === true,
    // Tre giorni: un ordine di oggi può ancora non essere in Orders, ma sopra i
    // tre giorni non è più latenza, è un import che non gira.
    vecchio: giorni != null && giorni > 3,
  };
});
