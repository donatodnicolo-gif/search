// Scrittura su Shopify: creazione di un prodotto su un negozio collegato.
//
// Il negozio e il token arrivano da /impostazioni (vedi negozi.ts): qui non si
// legge nessuna variabile d'ambiente e non si indovina nessun negozio.
//
// Nota sull'API 2024-10: dal 2024-07 le varianti NON si passano più dentro
// `productCreate`. La sequenza corretta è tre chiamate:
//   1. productCreate            → il prodotto (con le opzioni, se ha varianti)
//   2. productVariantsBulkCreate → le varianti vere (o l'aggiornamento di quella
//      di default per un prodotto senza varianti)
//   3. productCreateMedia       → le immagini, da URL pubblici
// Ogni passo può fallire per conto suo: l'esito raccoglie gli errori di tutti,
// perché "prodotto creato ma senza prezzo" è peggio di un errore netto.

import { VERSIONE_API } from "./negozi";

export type ErroreShopify = { campo: string | null; messaggio: string };

type Risposta<T> = { dati: T | null; errori: ErroreShopify[] };

async function graphql<T>(
  negozio: { dominio: string; token: string },
  query: string,
  variables: Record<string, unknown>
): Promise<Risposta<T>> {
  const res = await fetch(`https://${negozio.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": negozio.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    return { dati: null, errori: [{ campo: null, messaggio: "Token rifiutato dal negozio (401/403)." }] };
  }
  const corpo = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  if (corpo.errors?.length) {
    return { dati: null, errori: corpo.errors.map((e) => ({ campo: null, messaggio: e.message })) };
  }
  // Un 429/500/502 con corpo non-JSON arrivava qui come `{}`: dati null, errori
  // vuoti — indistinguibile da un successo. Nei passi 2 e 3 della creazione
  // prodotto voleva dire scrivere «varianti create con prezzi e SKU» su un
  // prodotto rimasto a 0,00 € e già pubblicato: esattamente il caso che il
  // commento in testa al file dichiara «peggio di un errore netto».
  if (!res.ok) {
    return { dati: null, errori: [{ campo: null, messaggio: `Il negozio ha risposto HTTP ${res.status} senza un esito leggibile.` }] };
  }
  if (!corpo.data) {
    return { dati: null, errori: [{ campo: null, messaggio: "Risposta del negozio senza dati: esito sconosciuto, non dato per buono." }] };
  }
  return { dati: corpo.data as T, errori: [] };
}

export type VarianteNuova = {
  nome: string;
  sku: string;
  prezzo: string;
  prezzoConfronto: string;
  giacenza: string;
};

export type ProdottoNuovo = {
  titolo: string;
  descrizioneHtml: string;
  tipo: string; // "product type" su Shopify: la categoria Deluxy
  vendor: string;
  tags: string[]; // la "linea" del prodotto e le altre etichette
  stato: "ACTIVE" | "DRAFT";
  prezzo: string;
  prezzoConfronto: string;
  sku: string;
  immagini: string[]; // URL pubblici; la prima è la principale
  fisico: boolean; // false = "not physical": niente spedizione né stock
  controllaStock: boolean;
  giacenza: string;
  nomeOpzione: string; // es. "Formato"
  varianti: VarianteNuova[];
  // I metafield: quelli del modulo «Nuovo su Shopify» sono testo nel namespace
  // "deluxy"; quelli del modulo prodotto arrivano dalle definizioni del negozio
  // con namespace e tipo propri (list.single_line_text_field, boolean…).
  metafield: { chiave: string; valore: string; namespace?: string; tipo?: string }[];
};

export type EsitoCreazione = {
  ok: boolean;
  prodottoId: string | null;
  handle: string | null;
  errori: ErroreShopify[];
  passi: string[]; // cronaca leggibile: serve quando qualcosa va a metà
};

function soldi(v: string): string | undefined {
  const n = parseFloat((v || "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : undefined;
}

/** Crea il prodotto sul negozio. Non tocca il catalogo locale: quello lo fa l'azione. */
export async function creaProdottoSuShopify(
  negozio: { dominio: string; token: string },
  p: ProdottoNuovo
): Promise<EsitoCreazione> {
  const passi: string[] = [];
  const errori: ErroreShopify[] = [];
  const conVarianti = p.varianti.length > 0;

  // ---- 1. Il prodotto ----
  const input: Record<string, unknown> = {
    title: p.titolo,
    descriptionHtml: p.descrizioneHtml || undefined,
    productType: p.tipo || undefined,
    vendor: p.vendor || undefined,
    tags: p.tags.length ? p.tags : undefined,
    status: p.stato,
  };
  if (p.metafield.length > 0) {
    input.metafields = p.metafield.map((m) => ({
      namespace: m.namespace ?? "deluxy",
      key: m.chiave,
      type: m.tipo ?? "single_line_text_field",
      value: m.valore,
    }));
  }
  if (conVarianti) {
    input.productOptions = [
      {
        name: p.nomeOpzione || "Formato",
        values: p.varianti.map((v) => ({ name: v.nome })),
      },
    ];
  }

  const creazione = await graphql<{
    productCreate: {
      product: { id: string; handle: string; variants: { nodes: { id: string }[] } } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    negozio,
    `mutation creaProdotto($input: ProductInput!) {
       productCreate(input: $input) {
         product { id handle variants(first: 1) { nodes { id } } }
         userErrors { field message }
       }
     }`,
    { input }
  );

  if (creazione.errori.length) return { ok: false, prodottoId: null, handle: null, errori: creazione.errori, passi };
  const uscita = creazione.dati?.productCreate;
  if (uscita?.userErrors?.length) {
    return {
      ok: false,
      prodottoId: null,
      handle: null,
      errori: uscita.userErrors.map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message })),
      passi,
    };
  }
  const prodottoId = uscita?.product?.id ?? null;
  const handle = uscita?.product?.handle ?? null;
  if (!prodottoId) {
    return { ok: false, prodottoId: null, handle: null, errori: [{ campo: null, messaggio: "Shopify non ha restituito il prodotto creato." }], passi };
  }
  passi.push(`Prodotto creato (${p.stato === "ACTIVE" ? "attivo" : "bozza"}).`);

  // ---- 2. Le varianti ----
  // Il magazzino serve solo se si vuole impostare una giacenza iniziale: lo si
  // chiede solo in quel caso, per non fare una chiamata inutile.
  let magazzinoId: string | null = null;
  const vuoleGiacenza =
    p.fisico && p.controllaStock && (conVarianti ? p.varianti.some((v) => Number(v.giacenza) > 0) : Number(p.giacenza) > 0);
  if (vuoleGiacenza) {
    const loc = await graphql<{ locations: { nodes: { id: string }[] } }>(
      negozio,
      `{ locations(first: 1) { nodes { id } } }`,
      {}
    );
    magazzinoId = loc.dati?.locations?.nodes?.[0]?.id ?? null;
    if (!magazzinoId) passi.push("Nessun magazzino leggibile: giacenze non impostate (serve read_inventory).");
  }

  const quantita = (q: string) =>
    magazzinoId && Number(q) > 0
      ? [{ locationId: magazzinoId, name: "available", quantity: Math.round(Number(q)) }]
      : undefined;

  const inventario = (sku: string) => ({
    sku: sku || undefined,
    tracked: p.fisico && p.controllaStock,
    requiresShipping: p.fisico,
  });

  if (conVarianti) {
    const variantiInput = p.varianti.map((v) => ({
      optionValues: [{ optionName: p.nomeOpzione || "Formato", name: v.nome }],
      price: soldi(v.prezzo) ?? soldi(p.prezzo) ?? "0.00",
      compareAtPrice: soldi(v.prezzoConfronto),
      inventoryItem: inventario(v.sku),
      inventoryQuantities: quantita(v.giacenza),
    }));
    const r = await graphql<{
      productVariantsBulkCreate: { userErrors: { field: string[] | null; message: string }[] };
    }>(
      negozio,
      `mutation creaVarianti($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
         productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: REMOVE_STANDALONE_VARIANT) {
           userErrors { field message }
         }
       }`,
      { productId: prodottoId, variants: variantiInput }
    );
    const errV = [...r.errori, ...(r.dati?.productVariantsBulkCreate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
    if (errV.length) errori.push(...errV);
    else passi.push(`${p.varianti.length} varianti create con prezzi e SKU.`);
  } else {
    const varianteId = uscita?.product?.variants?.nodes?.[0]?.id;
    if (varianteId) {
      const r = await graphql<{
        productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] };
      }>(
        negozio,
        `mutation aggiornaVariante($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
           productVariantsBulkUpdate(productId: $productId, variants: $variants) {
             userErrors { field message }
           }
         }`,
        {
          productId: prodottoId,
          variants: [
            {
              id: varianteId,
              price: soldi(p.prezzo) ?? "0.00",
              compareAtPrice: soldi(p.prezzoConfronto),
              inventoryItem: inventario(p.sku),
              inventoryQuantities: quantita(p.giacenza),
            },
          ],
        }
      );
      const errV = [...r.errori, ...(r.dati?.productVariantsBulkUpdate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
      if (errV.length) errori.push(...errV);
      else passi.push("Prezzo e SKU impostati sulla variante unica.");
    }
  }

  // ---- 3. Le immagini ----
  const immagini = p.immagini.filter(Boolean);
  if (immagini.length > 0) {
    const r = await graphql<{
      productCreateMedia: { mediaUserErrors: { field: string[] | null; message: string }[] };
    }>(
      negozio,
      `mutation aggiungiMedia($productId: ID!, $media: [CreateMediaInput!]!) {
         productCreateMedia(productId: $productId, media: $media) {
           mediaUserErrors { field message }
         }
       }`,
      {
        productId: prodottoId,
        media: immagini.map((src) => ({ originalSource: src, mediaContentType: "IMAGE", alt: p.titolo })),
      }
    );
    const errM = [...r.errori, ...(r.dati?.productCreateMedia?.mediaUserErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
    if (errM.length) errori.push(...errM);
    else passi.push(`${immagini.length} immagini in caricamento (Shopify le elabora in background).`);
  }

  return { ok: errori.length === 0, prodottoId, handle, errori, passi };
}

// ---------- Aggiornare un prodotto già sul negozio ----------

export type AggiornamentoProdotto = {
  shopifyId: string;
  titolo?: string;
  descrizioneHtml?: string;
  stato?: "ACTIVE" | "DRAFT";
  /** I tag: l'elenco completo, sostituisce quello del negozio. */
  tags?: string[];
  metafield?: { namespace: string; key: string; type: string; value: string }[];
  /** Le varianti del modulo: quelle con uno SKU già sul negozio si aggiornano, le altre si creano (se il prodotto ha già un'opzione). */
  varianti?: { sku: string; nome: string; prezzo: string; giacenza?: string }[];
  nomeOpzione?: string;
  /** Prezzo della variante unica, quando il prodotto non ha varianti. */
  prezzo?: string;
  sku?: string;
};

/**
 * Aggiorna un prodotto esistente (04/09/2026: «ogni prodotto si modifica con
 * lo stesso modulo»). Un passo per volta e ognuno riporta il suo esito:
 * `productUpdate` per titolo, descrizione, stato e metafield; poi le varianti
 * per SKU — quelle che il negozio ha già si aggiornano, quelle nuove si
 * creano solo se il prodotto ha già un'opzione (aggiungere la prima opzione a
 * un prodotto «senza varianti» è un'altra operazione, e si dice).
 */
export async function aggiornaProdottoSuShopify(
  negozio: { dominio: string; token: string },
  a: AggiornamentoProdotto
): Promise<{ ok: boolean; errori: ErroreShopify[]; passi: string[] }> {
  const passi: string[] = [];
  const errori: ErroreShopify[] = [];

  const input: Record<string, unknown> = { id: a.shopifyId };
  if (a.titolo != null) input.title = a.titolo;
  if (a.descrizioneHtml != null) input.descriptionHtml = a.descrizioneHtml;
  if (a.stato) input.status = a.stato;
  if (a.tags) input.tags = a.tags;
  if (a.metafield?.length) input.metafields = a.metafield;
  const r = await graphql<{ productUpdate: { product: { id: string } | null; userErrors: { field: string[] | null; message: string }[] } }>(
    negozio,
    `mutation aggiornaProdotto($input: ProductInput!) {
       productUpdate(input: $input) { product { id } userErrors { field message } }
     }`,
    { input }
  );
  const errU = [...r.errori, ...(r.dati?.productUpdate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
  if (errU.length) errori.push(...errU);
  else passi.push(`Scheda aggiornata sul negozio${a.metafield?.length ? ` con ${a.metafield.length} campi` : ""}.`);

  // ---- Varianti ----
  const lettura = await graphql<{
    product: { options: { name: string }[]; variants: { nodes: { id: string; sku: string | null; title: string }[] } } | null;
  }>(
    negozio,
    `query varianti($id: ID!) {
       product(id: $id) { options { name } variants(first: 100) { nodes { id sku title } } }
     }`,
    { id: a.shopifyId }
  );
  const esistenti = lettura.dati?.product?.variants.nodes ?? [];
  const haOpzioneVera = (lettura.dati?.product?.options ?? []).some((o) => o.name !== "Title");
  const perSku = new Map(esistenti.filter((v) => v.sku).map((v) => [v.sku as string, v]));

  if (a.varianti && a.varianti.length) {
    const daAggiornare = a.varianti.filter((v) => perSku.has(v.sku));
    const nuove = a.varianti.filter((v) => !perSku.has(v.sku));
    if (daAggiornare.length) {
      const r2 = await graphql<{ productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
        negozio,
        `mutation aggiornaVarianti($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
           productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
         }`,
        {
          productId: a.shopifyId,
          variants: daAggiornare.map((v) => ({ id: perSku.get(v.sku)!.id, price: soldi(v.prezzo) ?? "0.00" })),
        }
      );
      const e2 = [...r2.errori, ...(r2.dati?.productVariantsBulkUpdate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
      if (e2.length) errori.push(...e2);
      else passi.push(`${daAggiornare.length} varianti aggiornate.`);
    }
    if (nuove.length) {
      if (!haOpzioneVera) {
        errori.push({ campo: "varianti", messaggio: `${nuove.length} varianti nuove non aggiunte: il prodotto sul negozio non ha ancora un'opzione (si aggiunge dall'admin di Shopify, poi qui si aggiornano).` });
      } else {
        const nomeOpzione = lettura.dati?.product?.options[0]?.name ?? a.nomeOpzione ?? "Formato";
        const r3 = await graphql<{ productVariantsBulkCreate: { userErrors: { field: string[] | null; message: string }[] } }>(
          negozio,
          `mutation creaVarianti($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
             productVariantsBulkCreate(productId: $productId, variants: $variants) { userErrors { field message } }
           }`,
          {
            productId: a.shopifyId,
            variants: nuove.map((v) => ({
              optionValues: [{ optionName: nomeOpzione, name: v.nome }],
              price: soldi(v.prezzo) ?? "0.00",
              inventoryItem: { sku: v.sku },
            })),
          }
        );
        const e3 = [...r3.errori, ...(r3.dati?.productVariantsBulkCreate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
        if (e3.length) errori.push(...e3);
        else passi.push(`${nuove.length} varianti nuove create.`);
      }
    }
  } else if (a.prezzo != null && esistenti.length === 1) {
    const r4 = await graphql<{ productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
      negozio,
      `mutation aggiornaVariante($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
         productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
       }`,
      {
        productId: a.shopifyId,
        variants: [{ id: esistenti[0].id, price: soldi(a.prezzo) ?? "0.00", inventoryItem: a.sku ? { sku: a.sku } : undefined }],
      }
    );
    const e4 = [...r4.errori, ...(r4.dati?.productVariantsBulkUpdate?.userErrors ?? []).map((e) => ({ campo: e.field?.join(".") ?? null, messaggio: e.message }))];
    if (e4.length) errori.push(...e4);
    else passi.push("Prezzo aggiornato sulla variante unica.");
  }

  return { ok: errori.length === 0, errori, passi };
}
