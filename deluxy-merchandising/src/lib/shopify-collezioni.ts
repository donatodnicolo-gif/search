// Import delle collezioni **vere** di Shopify e di chi ci sta dentro.
//
// Come funziona, e perché così:
//
// 1. Si leggono tutte le collezioni del negozio (id, titolo, handle, quanti
//    prodotti dice Shopify che contengono). Vengono salvate tutte, anche quelle
//    di cui qui non conosciamo nemmeno un prodotto: sapere che esistono è già
//    un'informazione.
// 2. Si scorrono i prodotti del negozio chiedendo, per ognuno, gli SKU delle
//    varianti e le collezioni a cui appartiene. Un solo giro serve a entrambe
//    le cose, e Shopify fa pagare ogni campo: meglio una passata sola.
// 3. L'abbinamento con i prodotti di Merchandising è nell'ordine: **SKU della
//    variante**, poi codice del prodotto, poi titolo normalizzato. Quello che
//    non si abbina resta fuori e viene contato — non lo si indovina, come per
//    le vendite.

import { prisma } from "./db";
import { VERSIONE_API } from "./negozi";

type Negozio = { id: string; nome: string; dominio: string; token: string };

export type EsitoImportCollezioni = {
  ok: boolean;
  negozio: string;
  collezioniLette: number;
  prodottiLetti: number;
  abbinamenti: number;
  prodottiIgnoti: number;
  messaggio: string;
};

function normalizza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function graphql<T>(
  n: Negozio,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": n.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("Token rifiutato dal negozio (401/403).");
  const corpo = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (corpo.errors?.length) throw new Error(corpo.errors.map((e) => e.message).join(" · "));
  if (!corpo.data) throw new Error(`Risposta vuota dal negozio (HTTP ${res.status}).`);
  return corpo.data;
}

type CollezioneShopifyApi = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  image: { url: string } | null;
  productsCount: { count: number } | null;
};

/** Tutte le collezioni del negozio, pagina per pagina. */
async function leggiCollezioni(n: Negozio): Promise<CollezioneShopifyApi[]> {
  const fuori: CollezioneShopifyApi[] = [];
  let cursore: string | null = null;
  for (let pagina = 0; pagina < 40; pagina++) {
    const dati: {
      collections: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: CollezioneShopifyApi[] };
    } = await graphql(
      n,
      `query($cursore: String) {
         collections(first: 100, after: $cursore) {
           pageInfo { hasNextPage endCursor }
           nodes { id title handle descriptionHtml image { url } productsCount { count } }
         }
       }`,
      { cursore }
    );
    fuori.push(...dati.collections.nodes);
    if (!dati.collections.pageInfo.hasNextPage) break;
    cursore = dati.collections.pageInfo.endCursor;
  }
  return fuori;
}

type ProdottoShopifyApi = {
  id: string;
  title: string;
  handle: string;
  variants: { nodes: { sku: string | null }[] };
  collections: { nodes: { id: string }[] };
};

/**
 * I prodotti del negozio con SKU e collezioni di appartenenza.
 * Pagine da 25: Shopify fa pagare ogni campo annidato e con pagine più grandi
 * la query supera il costo massimo consentito.
 */
async function leggiProdotti(n: Negozio): Promise<ProdottoShopifyApi[]> {
  const fuori: ProdottoShopifyApi[] = [];
  let cursore: string | null = null;
  for (let pagina = 0; pagina < 400; pagina++) {
    const dati: {
      products: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ProdottoShopifyApi[] };
    } = await graphql(
      n,
      `query($cursore: String) {
         products(first: 25, after: $cursore) {
           pageInfo { hasNextPage endCursor }
           nodes {
             id title handle
             variants(first: 10) { nodes { sku } }
             collections(first: 10) { nodes { id } }
           }
         }
       }`,
      { cursore }
    );
    fuori.push(...dati.products.nodes);
    if (!dati.products.pageInfo.hasNextPage) break;
    cursore = dati.products.pageInfo.endCursor;
  }
  return fuori;
}

/** Importa collezioni e appartenenze di un negozio. */
export async function importaCollezioniDa(n: Negozio): Promise<EsitoImportCollezioni> {
  const base: EsitoImportCollezioni = {
    ok: false,
    negozio: n.nome,
    collezioniLette: 0,
    prodottiLetti: 0,
    abbinamenti: 0,
    prodottiIgnoti: 0,
    messaggio: "",
  };

  try {
    const [collezioni, prodottiShopify] = await Promise.all([leggiCollezioni(n), leggiProdotti(n)]);
    base.collezioniLette = collezioni.length;
    base.prodottiLetti = prodottiShopify.length;

    // — Le collezioni, tutte —
    const idLocale = new Map<string, string>(); // gid Shopify → id nostro
    for (const c of collezioni) {
      const riga = await prisma.collezioneShopify.upsert({
        where: { negozio_shopifyId: { negozio: n.nome, shopifyId: c.id } },
        create: {
          negozio: n.nome,
          shopifyId: c.id,
          handle: c.handle,
          titolo: c.title,
          descrizione: c.descriptionHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800) || null,
          immagine: c.image?.url ?? null,
          prodottiShopify: c.productsCount?.count ?? 0,
        },
        update: {
          handle: c.handle,
          titolo: c.title,
          descrizione: c.descriptionHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800) || null,
          immagine: c.image?.url ?? null,
          prodottiShopify: c.productsCount?.count ?? 0,
        },
      });
      idLocale.set(c.id, riga.id);
    }

    // — Indici per abbinare i prodotti —
    const [varianti, nostri] = await Promise.all([
      prisma.variante.findMany({ where: { sku: { not: null } }, select: { sku: true, prodottoId: true } }),
      prisma.prodotto.findMany({ select: { id: true, codice: true, nome: true } }),
    ]);
    const perSku = new Map(varianti.map((v) => [(v.sku as string).trim().toLowerCase(), v.prodottoId]));
    const perCodice = new Map(nostri.map((p) => [p.codice.trim().toLowerCase(), p.id]));
    const perNome = new Map(nostri.map((p) => [normalizza(p.nome), p.id]));

    // — Le appartenenze —
    const legami: { collezioneId: string; prodottoId: string }[] = [];
    for (const p of prodottiShopify) {
      let nostroId: string | undefined;
      for (const v of p.variants.nodes) {
        if (v.sku && perSku.has(v.sku.trim().toLowerCase())) {
          nostroId = perSku.get(v.sku.trim().toLowerCase());
          break;
        }
      }
      if (!nostroId) {
        for (const v of p.variants.nodes) {
          if (v.sku && perCodice.has(v.sku.trim().toLowerCase())) {
            nostroId = perCodice.get(v.sku.trim().toLowerCase());
            break;
          }
        }
      }
      if (!nostroId) nostroId = perCodice.get(p.handle.trim().toLowerCase()) ?? perNome.get(normalizza(p.title));
      if (!nostroId) {
        base.prodottiIgnoti++;
        continue;
      }
      for (const c of p.collections.nodes) {
        const collezioneId = idLocale.get(c.id);
        if (collezioneId) legami.push({ collezioneId, prodottoId: nostroId });
      }
    }

    // Si riscrive l'appartenenza di questo negozio: un prodotto tolto da una
    // collezione su Shopify deve sparire anche qui, altrimenti l'app racconta
    // una vetrina che non esiste più.
    const idCollezioniNegozio = [...idLocale.values()];
    if (idCollezioniNegozio.length > 0) {
      await prisma.prodottoInCollezioneShopify.deleteMany({
        where: { collezioneId: { in: idCollezioniNegozio } },
      });
    }
    for (let i = 0; i < legami.length; i += 500) {
      const esito = await prisma.prodottoInCollezioneShopify.createMany({
        data: legami.slice(i, i + 500),
        skipDuplicates: true,
      });
      base.abbinamenti += esito.count;
    }

    base.ok = true;
    base.messaggio =
      `${base.collezioniLette} collezioni lette, ${base.abbinamenti} appartenenze salvate su ${base.prodottiLetti} prodotti del negozio` +
      (base.prodottiIgnoti ? `; ${base.prodottiIgnoti} prodotti del negozio non corrispondono a nessun prodotto qui.` : ".");
  } catch (e) {
    base.messaggio = e instanceof Error ? e.message : "Errore sconosciuto durante l'import.";
  }

  await prisma.importCollezioni.create({
    data: {
      negozio: n.nome,
      collezioniLette: base.collezioniLette,
      prodottiLetti: base.prodottiLetti,
      abbinamenti: base.abbinamenti,
      prodottiIgnoti: base.prodottiIgnoti,
      esito: base.ok ? "ok" : "errore",
      messaggio: base.messaggio,
    },
  });

  return base;
}

/** Ultimo import per negozio, per mostrarlo in pagina. */
export async function ultimiImportCollezioni() {
  const righe = await prisma.importCollezioni.findMany({ orderBy: { iniziatoIl: "desc" }, take: 12 });
  const perNegozio = new Map<string, (typeof righe)[number]>();
  for (const r of righe) if (!perNegozio.has(r.negozio)) perNegozio.set(r.negozio, r);
  return [...perNegozio.values()];
}
