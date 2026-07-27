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
           nodes {
             id title handle descriptionHtml image { url } productsCount { count }
             sortOrder templateSuffix updatedAt
             seo { title description }
             ruleSet { appliedDisjunctively rules { column relation condition } }
           }
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
  productType: string | null;
  category: { id: string; name: string; fullName: string | null } | null;
  vendor: string | null;
  tags: string[];
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
             id title handle productType vendor tags
             category { id name fullName }
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
          tipo: c.ruleSet ? 'automatica' : 'manuale',
          ordinamento: c.sortOrder ?? null,
          regole: c.ruleSet ? JSON.stringify(c.ruleSet) : null,
          seoTitolo: c.seo?.title ?? null,
          seoDescrizione: c.seo?.description ?? null,
          modelloTema: c.templateSuffix ?? null,
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
          aggiornataShopifyIl: c.updatedAt ? new Date(c.updatedAt) : null,
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

    // — Le appartenenze, e quello che Shopify sa del prodotto —
    const legami: { collezioneId: string; prodottoId: string }[] = [];
    const daAggiornare: { id: string; tipoShopify: string | null; categoriaShopifyId: string | null; categoriaShopifyNome: string | null; vendorShopify: string | null; tagShopify: string | null; handleShopify: string }[] = [];
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

      // Il tipo prodotto lo scrive chi cura il negozio: è un dato, non una
      // deduzione dal titolo. Si salva accanto alla categoria interna senza
      // sovrascriverla — una si legge da Shopify, l'altra la decide una persona.
      daAggiornare.push({
        id: nostroId,
        tipoShopify: p.productType?.trim() || null,
        categoriaShopifyId: p.category?.id ?? null,
        categoriaShopifyNome: p.category?.fullName || p.category?.name || null,
        vendorShopify: p.vendor?.trim() || null,
        tagShopify: p.tags?.length ? p.tags.join(", ").slice(0, 500) : null,
        handleShopify: p.handle,
      });
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
            },
          })
        )
      );
    }

    await aggiornaRegistroCategorie();

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
