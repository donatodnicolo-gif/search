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
};

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
 */
export async function importaVendite(giorni = 90): Promise<EsitoImport> {
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
    for (let page = 1; page <= 40; page++) {
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

          const data = new Date(o.data);
          data.setHours(0, 0, 0, 0);
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
      if (ordini.length === 0 || page >= (corpo.pagine ?? 1)) break;
    }

    // createMany + skipDuplicates: il riferimento è unico, quindi rilanciare
    // l'import non crea doppioni e aggiorna solo ciò che manca.
    for (let i = 0; i < daInserire.length; i += 500) {
      const blocco = daInserire.slice(i, i + 500);
      const esito = await prisma.vendita.createMany({ data: blocco, skipDuplicates: true });
      righeNuove += esito.count;
    }

    await prisma.importVendite.create({
      data: {
        dal,
        al,
        ordiniLetti,
        righeLette,
        righeNuove,
        righeAbbinate,
        esito: "ok",
        messaggio: `${righeNuove} righe nuove su ${righeLette} lette`,
      },
    });

    return {
      ok: true,
      messaggio:
        righeNuove === 0
          ? `Nessuna vendita nuova: le ${righeLette} righe lette erano già registrate.`
          : `${righeNuove} vendite importate (${righeAbbinate} righe abbinate a un prodotto su ${righeLette} lette).`,
      ordiniLetti,
      righeLette,
      righeNuove,
      righeAbbinate,
    };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : "Errore sconosciuto durante l'import.";
    await prisma.importVendite.create({
      data: { dal, al, ordiniLetti, righeLette, righeNuove, righeAbbinate, esito: "errore", messaggio },
    });
    return { ok: false, messaggio, ordiniLetti, righeLette, righeNuove, righeAbbinate };
  }
}

/** Ultimo import eseguito (per mostrarne l'esito in pagina). */
export async function ultimoImport() {
  return prisma.importVendite.findFirst({ orderBy: { iniziatoIl: "desc" } });
}
