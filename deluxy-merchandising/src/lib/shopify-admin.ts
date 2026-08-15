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
  metafield: { chiave: string; valore: string }[]; // namespace "deluxy"
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
      namespace: "deluxy",
      key: m.chiave,
      type: "single_line_text_field",
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
