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
// 3. L'abbinamento con i prodotti di Merchandising è nell'ordine: **id Shopify**
//    (esatto, quando la scheda qui è già collegata), poi **SKU della variante**,
//    poi codice del prodotto, poi handle, poi titolo normalizzato.
// 4. Quello che ancora non si abbina **si crea**: è un prodotto che esiste
//    davvero sul negozio, e tenerlo fuori voleva dire mostrare collezioni mezze
//    vuote (misurato: 70 collezioni pubblicate su 343 senza nemmeno un prodotto,
//    «Torte Classiche» 127 qui contro 440 su Shopify). La scheda nasce **solo
//    con dati letti** — titolo, handle, prezzo delle varianti, immagine, tipo,
//    fornitore, tag, giorni di consegna — e con costo 0 e categoria «Da
//    classificare», che restano da compilare: non si deducono.
//    Nasce anche con `shopifyId`, quindi al prossimo import si riaggancia da lì
//    e non si ricrea. Nessuna somiglianza indovinata: due schede che sono lo
//    stesso prodotto si uniscono a mano in /prodotti/riconcilia.

import { prisma } from "./db";
import { VERSIONE_API } from "./negozi";
import { riapplicaStandingPerNegozio } from "./ordinamento-vetrina";

type Negozio = { id: string; nome: string; dominio: string; token: string };

export type EsitoImportCollezioni = {
  ok: boolean;
  negozio: string;
  collezioniLette: number;
  prodottiLetti: number;
  abbinamenti: number;
  prodottiCreati: number;
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

/** Codice leggibile ricavato da un testo (handle o titolo), come fa il catalogo dal venduto. */
function slugCodice(s: string): string {
  const x = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return x || "ARTICOLO";
}

/**
 * Se tutte le varianti sono numerazioni dello stesso codice (ICQLBN-1,
 * ICQLBN-2…), quel codice è il codice del prodotto: è già la lingua del negozio,
 * e riusarlo evita di inventarne uno nuovo.
 */
function codiceDaSku(skus: string[]): string | null {
  const basi = new Set(skus.map((s) => s.replace(/-\d+$/, "").trim()).filter((s) => s.length >= 4));
  return basi.size === 1 ? [...basi][0] : null;
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una chiamata GraphQL, con la gestione del **limite di Shopify**.
 *
 * Shopify non conta le richieste ma il "costo" dei campi chiesti, e ricarica il
 * credito a ritmo costante. Scaricando più negozi di fila il credito finisce e
 * la risposta è `Throttled`: non è un errore da mostrare all'utente, è un
 * «aspetta». Qui si aspetta e si riprova, allungando l'attesa a ogni tentativo;
 * quando Shopify dice quanto credito resta e a che ritmo lo ricarica (campo
 * `throttleStatus`), si usa quello invece di un tempo a caso.
 */
async function graphql<T>(
  n: Negozio,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  let attesa = 2000;
  for (let tentativo = 1; tentativo <= 6; tentativo++) {
    const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": n.token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) throw new Error("Token rifiutato dal negozio (401/403).");

    if (res.status === 429) {
      if (tentativo === 6) throw new Error("Shopify continua a rifiutare per limite di richieste (429).");
      await attendi(attesa);
      attesa *= 2;
      continue;
    }

    const corpo = (await res.json().catch(() => ({}))) as {
      data?: T;
      errors?: { message: string; extensions?: { code?: string } }[];
      extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number }; requestedQueryCost?: number } };
    };

    const limitato = corpo.errors?.some(
      (e) => e.extensions?.code === "THROTTLED" || /throttl/i.test(e.message)
    );
    if (limitato) {
      if (tentativo === 6) throw new Error("Shopify limita le richieste: riprova fra qualche minuto.");
      const stato = corpo.extensions?.cost?.throttleStatus;
      const costo = corpo.extensions?.cost?.requestedQueryCost ?? 0;
      const secondi =
        stato && stato.restoreRate > 0
          ? Math.min(20, Math.max(1, (costo - stato.currentlyAvailable) / stato.restoreRate + 1))
          : attesa / 1000;
      await attendi(secondi * 1000);
      attesa *= 2;
      continue;
    }

    if (corpo.errors?.length) throw new Error(corpo.errors.map((e) => e.message).join(" · "));
    if (!corpo.data) throw new Error(`Risposta vuota dal negozio (HTTP ${res.status}).`);
    return corpo.data;
  }
  throw new Error("Shopify non ha risposto dopo più tentativi.");
}

type CollezioneShopifyApi = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  image: { url: string } | null;
  productsCount: { count: number } | null;
  sortOrder: string | null;
  templateSuffix: string | null;
  updatedAt: string | null;
  seo: { title: string | null; description: string | null } | null;
  // C'è solo sulle collezioni automatiche: sono le condizioni con cui Shopify
  // decide da sola chi ci finisce dentro.
  ruleSet: {
    appliedDisjunctively: boolean;
    rules: { column: string; relation: string; condition: string }[];
  } | null;
  // È pubblicata sul negozio online (la vedono i clienti)? Alias `pubblicata`:
  // dietro c'è publishedOnPublication(Online Store). Presente **solo** se abbiamo
  // trovato la pubblicazione Online Store (serve lo scope read_publications):
  // altrimenti il campo si omette del tutto, perché `publishedOnCurrentPublication`
  // fa fallire l'intera query sui token che non hanno una pubblicazione propria.
  pubblicata?: boolean | null;
};

/**
 * L'id della pubblicazione "Online Store", cioè la vetrina che vedono i clienti.
 * Serve per sapere se una collezione è davvero pubblicata sul sito e non solo
 * esistente. Se non la troviamo (negozio senza Online Store, o manca lo scope
 * read_publications) si torna null: l'import allora non chiede la pubblicazione e
 * mostra comunque tutte le collezioni (ripiego dichiarato).
 */
async function trovaOnlineStore(n: Negozio): Promise<string | null> {
  try {
    const dati: { publications: { nodes: { id: string; name: string }[] } } = await graphql(
      n,
      `query { publications(first: 20) { nodes { id name } } }`
    );
    const os = dati.publications.nodes.find((p) => /online store/i.test(p.name));
    return os?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Tutte le collezioni del negozio, pagina per pagina. Se abbiamo l'id della
 * pubblicazione Online Store (`osId`) chiediamo anche se ognuna è pubblicata; se
 * non ce l'abbiamo (token senza `read_publications`) **omettiamo** il campo: non
 * si può usare `publishedOnCurrentPublication` perché su questi token fa fallire
 * tutta la query. In quel caso la pubblicazione resta ignota e il chiamante
 * decide il ripiego.
 */
async function leggiCollezioni(n: Negozio, osId: string | null): Promise<CollezioneShopifyApi[]> {
  const fuori: CollezioneShopifyApi[] = [];
  const campoPubblicata = osId ? "pubblicata: publishedOnPublication(publicationId: $osId)" : "";
  let cursore: string | null = null;
  for (let pagina = 0; pagina < 40; pagina++) {
    const dati: {
      collections: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: CollezioneShopifyApi[] };
    } = await graphql(
      n,
      `query($cursore: String${osId ? ", $osId: ID!" : ""}) {
         collections(first: 100, after: $cursore) {
           pageInfo { hasNextPage endCursor }
           nodes {
             id title handle descriptionHtml image { url } productsCount { count }
             sortOrder templateSuffix updatedAt
             seo { title description }
             ruleSet { appliedDisjunctively rules { column relation condition } }
             ${campoPubblicata}
           }
         }
       }`,
      osId ? { cursore, osId } : { cursore }
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
  productType: string | null;
  category: { id: string; name: string; fullName: string | null } | null;
  vendor: string | null;
  tags: string[];
  // ACTIVE | DRAFT | ARCHIVED: è lo stato **dichiarato** dal negozio, e diventa
  // la fase delle schede create qui. Letto, non dedotto.
  status: string | null;
  featuredImage: { url: string } | null;
  variants: { nodes: { sku: string | null; title: string | null; price: string | null }[] };
  collections: { nodes: { id: string }[] };
  // Il metafield `prodotto.consegna` (mostrato come "gg_disp_min"): giorni minimi
  // per evadere. Da qui la tipologia di risposta al bisogno.
  consegna: { value: string } | null;
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
             id title handle productType vendor tags status
             category { id name fullName }
             featuredImage { url }
             variants(first: 10) { nodes { sku title price } }
             collections(first: 10) { nodes { id } }
             consegna: metafield(namespace: "prodotto", key: "consegna") { value }
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

/** Gli indici con cui si riconosce un prodotto del negozio fra i nostri. */
type Indici = {
  perShopifyId: Map<string, string>;
  perSku: Map<string, string>;
  perCodice: Map<string, string>;
  perNome: Map<string, string>;
};

async function costruisciIndici(): Promise<Indici> {
  const [varianti, nostri] = await Promise.all([
    prisma.variante.findMany({ where: { sku: { not: null } }, select: { sku: true, prodottoId: true } }),
    prisma.prodotto.findMany({ select: { id: true, codice: true, nome: true, shopifyId: true, handleShopify: true } }),
  ]);
  const perCodice = new Map(nostri.map((p) => [p.codice.trim().toLowerCase(), p.id]));
  // L'handle vale come un codice: è il nome del prodotto nell'indirizzo del
  // negozio, e sulle schede create da qui è l'aggancio di riserva se un domani
  // il gid cambiasse.
  for (const p of nostri) if (p.handleShopify) perCodice.set(p.handleShopify.trim().toLowerCase(), p.id);
  return {
    perShopifyId: new Map(nostri.filter((p) => p.shopifyId).map((p) => [p.shopifyId as string, p.id])),
    perSku: new Map(varianti.map((v) => [(v.sku as string).trim().toLowerCase(), v.prodottoId])),
    perCodice,
    perNome: new Map(nostri.map((p) => [normalizza(p.nome), p.id])),
  };
}

/**
 * Riconosce un prodotto del negozio fra i nostri, dal più esatto al più incerto.
 * **Una funzione sola**, usata dall'import e dall'anteprima: con due copie lo
 * stesso prodotto finirebbe per essere riconosciuto in due modi diversi.
 */
function abbina(p: ProdottoShopifyApi, ix: Indici): string | undefined {
  // 1. L'id Shopify: non è una somiglianza, è lo stesso prodotto.
  const perId = ix.perShopifyId.get(p.id);
  if (perId) return perId;
  // 2. Lo SKU di una variante.
  for (const v of p.variants.nodes) {
    const s = v.sku?.trim().toLowerCase();
    if (s && ix.perSku.has(s)) return ix.perSku.get(s);
  }
  // 3. Lo SKU usato come codice del prodotto.
  for (const v of p.variants.nodes) {
    const s = v.sku?.trim().toLowerCase();
    if (s && ix.perCodice.has(s)) return ix.perCodice.get(s);
  }
  // 4. L'handle, poi il titolo normalizzato.
  return ix.perCodice.get(p.handle.trim().toLowerCase()) ?? ix.perNome.get(normalizza(p.title));
}

// Lo stato del negozio diventa la fase della scheda: è dichiarato da chi cura il
// sito, non dedotto. Un prodotto archiviato su Shopify nasce archiviato anche
// qui, e quindi resta fuori dalle classifiche — che è la cosa giusta.
const FASE_DA_STATO: Record<string, string> = { ACTIVE: "in_vendita", DRAFT: "concept", ARCHIVED: "archiviato" };
const SYNC_DA_STATO: Record<string, string> = { ACTIVE: "pubblicato", DRAFT: "bozza", ARCHIVED: "non_pubblicato" };

/**
 * Crea le schede dei prodotti che il negozio ha e qui non c'erano.
 *
 * Solo dati letti: titolo, handle, immagine, prezzo delle varianti, stato, tipo,
 * fornitore, tag, giorni di consegna. **Costo 0 e categoria «Da classificare»**
 * restano da compilare — dedurli dal titolo darebbe margini inventati.
 * Il prezzo del prodotto è il **minimo delle varianti** e ogni variante porta la
 * differenza in `deltaPrezzo`: è esattamente il modello «base + delta» dell'app,
 * e la fascia di prezzo si legge sul prezzo d'ingresso come fa il negozio.
 */
async function creaProdottiMancanti(
  orfani: ProdottoShopifyApi[],
  negozio: string,
  ix: Indici,
): Promise<Map<string, string>> {
  const oggi = new Date().toLocaleDateString("it-IT");
  const codiciPresi = new Set(ix.perCodice.keys());
  const skuPresi = new Set(ix.perSku.keys());

  const daCreare: { gid: string; codice: string; prezzo: number; p: ProdottoShopifyApi }[] = [];
  for (const p of orfani) {
    const skus = p.variants.nodes.map((v) => v.sku?.trim()).filter((s): s is string => !!s);
    const radice = (codiceDaSku(skus) ?? slugCodice(p.handle || p.title)).toUpperCase();
    let codice = radice;
    let k = 2;
    while (codiciPresi.has(codice.toLowerCase())) codice = `${radice}-${k++}`;
    codiciPresi.add(codice.toLowerCase());

    const prezzi = p.variants.nodes
      .map((v) => Number.parseFloat(v.price ?? ""))
      .filter((x) => Number.isFinite(x) && x > 0);
    daCreare.push({ gid: p.id, codice, prezzo: prezzi.length ? Math.min(...prezzi) : 0, p });
  }

  for (let i = 0; i < daCreare.length; i += 200) {
    await prisma.prodotto.createMany({
      data: daCreare.slice(i, i + 200).map(({ codice, prezzo, p }) => {
        const ggRaw = p.consegna?.value?.trim();
        const gg = ggRaw ? Number.parseInt(ggRaw, 10) : NaN;
        return {
          codice,
          nome: p.title.slice(0, 200),
          categoria: "DA_CLASSIFICARE",
          fase: FASE_DA_STATO[p.status ?? ""] ?? "in_vendita",
          costoProduzione: 0,
          prezzoVendita: prezzo,
          immagine: p.featuredImage?.url ?? null,
          tipoShopify: p.productType?.trim() || null,
          categoriaShopifyId: p.category?.id ?? null,
          categoriaShopifyNome: p.category?.fullName || p.category?.name || null,
          vendorShopify: p.vendor?.trim() || null,
          tagShopify: p.tags?.length ? p.tags.join(", ").slice(0, 500) : null,
          handleShopify: p.handle,
          ggDispMin: Number.isFinite(gg) ? gg : null,
          shopifyId: p.id,
          shopifyStato: SYNC_DA_STATO[p.status ?? ""] ?? "non_pubblicato",
          noteSviluppo: `Creato dall'import delle collezioni di ${negozio} il ${oggi}: il negozio ce l'ha, qui non c'era. Costo di produzione e categoria da compilare.`,
        };
      }),
      skipDuplicates: true,
    });
  }

  // Si rileggono per codice: `createMany` non restituisce gli id.
  const nati = new Map(
    (
      await prisma.prodotto.findMany({
        where: { codice: { in: daCreare.map((d) => d.codice) } },
        select: { id: true, codice: true },
      })
    ).map((p) => [p.codice, p.id]),
  );

  const varianti: { prodottoId: string; nome: string; sku: string | null; deltaPrezzo: number }[] = [];
  for (const { codice, prezzo, p } of daCreare) {
    const id = nati.get(codice);
    if (!id) continue;
    for (const v of p.variants.nodes) {
      const sku = v.sku?.trim() || null;
      // Lo SKU è unico in tutta l'app: se è già di qualcun altro la variante
      // nasce **senza** SKU invece di far fallire il blocco intero.
      const libero = sku != null && !skuPresi.has(sku.toLowerCase());
      if (libero) skuPresi.add(sku.toLowerCase());
      const pv = Number.parseFloat(v.price ?? "");
      varianti.push({
        prodottoId: id,
        // "Default Title" è come Shopify chiama il prodotto senza varianti: qui
        // si chiama "Unica", che è quello che si legge in una scheda.
        nome: (v.title && v.title !== "Default Title" ? v.title : "Unica").slice(0, 120),
        sku: libero ? sku : null,
        deltaPrezzo: Number.isFinite(pv) && prezzo > 0 ? Math.round((pv - prezzo) * 100) / 100 : 0,
      });
    }
  }
  for (let i = 0; i < varianti.length; i += 300) {
    await prisma.variante.createMany({ data: varianti.slice(i, i + 300), skipDuplicates: true });
  }

  const fuori = new Map<string, string>();
  for (const d of daCreare) {
    const id = nati.get(d.codice);
    if (id) fuori.set(d.gid, id);
  }
  return fuori;
}

/**
 * Quanti prodotti del negozio l'app riconosce, e quanti ne creerebbe. **Non
 * scrive niente**: serve a guardare il conto prima di toccare dati veri.
 */
export async function anteprimaAbbinamento(n: Negozio) {
  const prodottiShopify = await leggiProdotti(n);
  const ix = await costruisciIndici();
  const orfani = prodottiShopify.filter((p) => !abbina(p, ix));
  return {
    negozio: n.nome,
    letti: prodottiShopify.length,
    riconosciuti: prodottiShopify.length - orfani.length,
    daCreare: orfani.length,
    esempi: orfani.slice(0, 8).map((p) => ({
      titolo: p.title,
      handle: p.handle,
      sku: p.variants.nodes.map((v) => v.sku).filter(Boolean).join(", ") || "—",
      collezioni: p.collections.nodes.length,
    })),
  };
}

/** Importa collezioni e appartenenze di un negozio. */
export async function importaCollezioniDa(n: Negozio): Promise<EsitoImportCollezioni> {
  const base: EsitoImportCollezioni = {
    ok: false,
    negozio: n.nome,
    collezioniLette: 0,
    prodottiLetti: 0,
    abbinamenti: 0,
    prodottiCreati: 0,
    prodottiIgnoti: 0,
    messaggio: "",
  };

  try {
    const osId = await trovaOnlineStore(n);
    const [collezioni, prodottiShopify] = await Promise.all([leggiCollezioni(n, osId), leggiProdotti(n)]);
    base.collezioniLette = collezioni.length;
    base.prodottiLetti = prodottiShopify.length;

    // — Le collezioni, tutte —
    // Se non abbiamo potuto leggere la pubblicazione (nessun Online Store /
    // manca read_publications) mostriamo comunque la collezione in Visual (pub =
    // true): «esiste sul negozio» è meglio di una Visual vuota, e la si può
    // sospendere a mano. Quando invece l'abbiamo letta, vale il dato vero.
    const pubblicazioneLetta = osId != null;
    const idLocale = new Map<string, string>(); // gid Shopify → id nostro
    for (const c of collezioni) {
      const pub = pubblicazioneLetta ? c.pubblicata ?? false : true;
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
          tipo: c.ruleSet ? 'automatica' : 'manuale',
          ordinamento: c.sortOrder ?? null,
          regole: c.ruleSet ? JSON.stringify(c.ruleSet) : null,
          seoTitolo: c.seo?.title ?? null,
          seoDescrizione: c.seo?.description ?? null,
          modelloTema: c.templateSuffix ?? null,
          pubblicataShopify: pub,
          aggiornataShopifyIl: c.updatedAt ? new Date(c.updatedAt) : null,
        },
        update: {
          handle: c.handle,
          titolo: c.title,
          descrizione: c.descriptionHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800) || null,
          immagine: c.image?.url ?? null,
          prodottiShopify: c.productsCount?.count ?? 0,
          tipo: c.ruleSet ? 'automatica' : 'manuale',
          ordinamento: c.sortOrder ?? null,
          regole: c.ruleSet ? JSON.stringify(c.ruleSet) : null,
          seoTitolo: c.seo?.title ?? null,
          seoDescrizione: c.seo?.description ?? null,
          modelloTema: c.templateSuffix ?? null,
          pubblicataShopify: pub,
          aggiornataShopifyIl: c.updatedAt ? new Date(c.updatedAt) : null,
          // I campi nostri (regolaOrdinamento, ordine*, posizioni, stato, note,
          // inCampagne) NON si toccano: li decide una persona, un import non li
          // sovrascrive.
        },
      });
      idLocale.set(c.id, riga.id);
    }

    // — Chi è chi: prima si riconosce, poi si crea quello che manca —
    // Creare **prima** di costruire le appartenenze è l'unico ordine che dà una
    // collezione completa: prima i prodotti sconosciuti venivano contati e
    // buttati, e la collezione risultava mezza vuota.
    const ix = await costruisciIndici();
    const risolto = new Map<string, string>(); // gid Shopify → id nostro
    const orfani: ProdottoShopifyApi[] = [];
    for (const p of prodottiShopify) {
      const id = abbina(p, ix);
      if (id) risolto.set(p.id, id);
      else orfani.push(p);
    }
    if (orfani.length > 0) {
      const nati = await creaProdottiMancanti(orfani, n.nome, ix);
      for (const [gid, id] of nati) risolto.set(gid, id);
      base.prodottiCreati = nati.size;
    }
    base.prodottiIgnoti = prodottiShopify.length - risolto.size;

    // — Le appartenenze, e quello che Shopify sa del prodotto —
    const legami: { collezioneId: string; prodottoId: string; prodottoShopifyId: string; posizione: number }[] = [];
    const daAggiornare: { id: string; tipoShopify: string | null; categoriaShopifyId: string | null; categoriaShopifyNome: string | null; vendorShopify: string | null; tagShopify: string | null; handleShopify: string; ggDispMin: number | null }[] = [];
    for (const p of prodottiShopify) {
      const nostroId = risolto.get(p.id);
      if (!nostroId) continue;
      for (const c of p.collections.nodes) {
        const collezioneId = idLocale.get(c.id);
        // La posizione curata si recupera più sotto, dopo aver riletto quella
        // esistente: qui si mette 0 come segnaposto.
        if (collezioneId) legami.push({ collezioneId, prodottoId: nostroId, prodottoShopifyId: p.id, posizione: 0 });
      }

      // Il tipo prodotto lo scrive chi cura il negozio: è un dato, non una
      // deduzione dal titolo. Si salva accanto alla categoria interna senza
      // sovrascriverla — una si legge da Shopify, l'altra la decide una persona.
      const ggRaw = p.consegna?.value?.trim();
      const gg = ggRaw != null && ggRaw !== "" ? Number.parseInt(ggRaw, 10) : NaN;
      daAggiornare.push({
        id: nostroId,
        tipoShopify: p.productType?.trim() || null,
        categoriaShopifyId: p.category?.id ?? null,
        categoriaShopifyNome: p.category?.fullName || p.category?.name || null,
        vendorShopify: p.vendor?.trim() || null,
        tagShopify: p.tags?.length ? p.tags.join(", ").slice(0, 500) : null,
        handleShopify: p.handle,
        ggDispMin: Number.isFinite(gg) ? gg : null,
      });
    }

    // Si riscrive l'appartenenza di questo negozio: un prodotto tolto da una
    // collezione su Shopify deve sparire anche qui, altrimenti l'app racconta
    // una vetrina che non esiste più. Ma **l'ordine curato non si perde**: prima
    // di cancellare si legge la posizione già decisa (collezione+prodotto) e la
    // si riporta sui legami che restano; i prodotti nuovi entrano a 0.
    const idCollezioniNegozio = [...idLocale.values()];
    if (idCollezioniNegozio.length > 0) {
      const esistenti = await prisma.prodottoInCollezioneShopify.findMany({
        where: { collezioneId: { in: idCollezioniNegozio } },
        select: { collezioneId: true, prodottoId: true, posizione: true },
      });
      const posizionePrec = new Map(esistenti.map((e) => [`${e.collezioneId}|${e.prodottoId}`, e.posizione]));
      for (const l of legami) l.posizione = posizionePrec.get(`${l.collezioneId}|${l.prodottoId}`) ?? 0;
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

    // Aggiornamento in blocchi: sono migliaia di righe, una per volta ci
    // metterebbe minuti.
    for (let i = 0; i < daAggiornare.length; i += 25) {
      await Promise.all(
        daAggiornare.slice(i, i + 25).map((d) =>
          prisma.prodotto.update({
            where: { id: d.id },
            data: {
              tipoShopify: d.tipoShopify,
              categoriaShopifyId: d.categoriaShopifyId,
              categoriaShopifyNome: d.categoriaShopifyNome,
              vendorShopify: d.vendorShopify,
              tagShopify: d.tagShopify,
              handleShopify: d.handleShopify,
              ggDispMin: d.ggDispMin,
            },
          })
        )
      );
    }

    await aggiornaRegistroCategorie();

    // Regole standing: le collezioni con una tipologia che ha una regola si
    // risistemano da sole coi prodotti appena arrivati. Non deve far fallire
    // l'import se qualcosa va storto qui.
    try {
      await riapplicaStandingPerNegozio(n.nome);
    } catch {
      // l'import è comunque riuscito: il riordino standing si rifà alla prossima.
    }

    base.ok = true;
    base.messaggio =
      `${base.collezioniLette} collezioni lette, ${base.abbinamenti} appartenenze salvate su ${base.prodottiLetti} prodotti del negozio` +
      (base.prodottiCreati ? `; ${base.prodottiCreati} schede create per prodotti che qui non c'erano (costo e categoria da compilare)` : "") +
      (base.prodottiIgnoti ? `; ${base.prodottiIgnoti} prodotti del negozio non corrispondono a nessun prodotto qui` : "") +
      (pubblicazioneLetta
        ? "."
        : "; stato di pubblicazione non leggibile (manca lo scope read_publications): mostrate tutte in Visual, sospendi a mano quelle che non vuoi.");
  } catch (e) {
    base.messaggio = e instanceof Error ? e.message : "Errore sconosciuto durante l'import.";
  }

  await prisma.importCollezioni.create({
    data: {
      negozio: n.nome,
      collezioniLette: base.collezioniLette,
      prodottiLetti: base.prodottiLetti,
      abbinamenti: base.abbinamenti,
      prodottiCreati: base.prodottiCreati,
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


/**
 * Rifà il registro delle categorie viste sui negozi: la tassonomia standard di
 * Shopify e i «tipi prodotto» scritti a mano. Si ricalcola per intero a ogni
 * import — sono poche migliaia di righe — così una categoria sparita dal
 * negozio sparisce anche da qui invece di restare come fantasma.
 */
export async function aggiornaRegistroCategorie(): Promise<void> {
  const prodotti = await prisma.prodotto.findMany({
    where: { OR: [{ categoriaShopifyId: { not: null } }, { tipoShopify: { not: null } }] },
    select: {
      categoriaShopifyId: true,
      categoriaShopifyNome: true,
      tipoShopify: true,
      collezioniShopify: { select: { collezione: { select: { negozio: true } } } },
    },
  });

  type Voce = { origine: string; chiave: string; nome: string; nomeCompleto: string | null; prodotti: number; negozi: Set<string> };
  const registro = new Map<string, Voce>();
  const aggiungi = (origine: string, chiave: string, nome: string, nomeCompleto: string | null, negozi: string[]) => {
    const k = origine + '|' + chiave;
    const v = registro.get(k) ?? { origine, chiave, nome, nomeCompleto, prodotti: 0, negozi: new Set<string>() };
    v.prodotti += 1;
    for (const n of negozi) v.negozi.add(n);
    registro.set(k, v);
  };

  for (const p of prodotti) {
    const negozi = [...new Set(p.collezioniShopify.map((c) => c.collezione.negozio))];
    if (p.categoriaShopifyId) {
      const completo = p.categoriaShopifyNome ?? '';
      const corto = completo.includes('>') ? completo.split('>').pop()!.trim() : completo || p.categoriaShopifyId;
      aggiungi('tassonomia', p.categoriaShopifyId, corto, completo || null, negozi);
    }
    if (p.tipoShopify) aggiungi('tipo', p.tipoShopify, p.tipoShopify, null, negozi);
  }

  const vive = [...registro.values()];
  for (const v of vive) {
    await prisma.categoriaShopify.upsert({
      where: { origine_chiave: { origine: v.origine, chiave: v.chiave } },
      create: {
        origine: v.origine,
        chiave: v.chiave,
        nome: v.nome,
        nomeCompleto: v.nomeCompleto,
        prodotti: v.prodotti,
        negozi: [...v.negozi].join(', ') || null,
      },
      // La corrispondenza con la nostra categoria NON si tocca: l'ha decisa una
      // persona e un import non la cancella.
      update: { nome: v.nome, nomeCompleto: v.nomeCompleto, prodotti: v.prodotti, negozi: [...v.negozi].join(', ') || null },
    });
  }
  const chiaviVive = vive.map((v) => v.origine + '|' + v.chiave);
  const tutte = await prisma.categoriaShopify.findMany({ select: { id: true, origine: true, chiave: true } });
  const morte = tutte.filter((x) => !chiaviVive.includes(x.origine + '|' + x.chiave)).map((x) => x.id);
  if (morte.length) await prisma.categoriaShopify.deleteMany({ where: { id: { in: morte } } });
}
