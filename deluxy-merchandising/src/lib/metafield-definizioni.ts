// **I metafield di prodotto del negozio: il vocabolario.**
//
// Chiesto dall'utente il 04/09/2026: «importa da Shopify tutti i metafield del
// prodotto e mettili da riempire anche in nuovo prodotto». Il negozio dichiara
// i suoi campi con le **definizioni** (`metafieldDefinitions`): nome, tipo e —
// per molti — l'elenco dei valori ammessi (Occasioni, Fiori, Colore…). Sono
// quelle a dire cosa si può compilare: il modulo le rende campo per campo, e
// l'import le usa per leggere i valori di ogni prodotto senza una lista fissa
// scritta nel codice.
//
// Si tengono qui solo i tipi che una persona compila in un modulo: testo,
// testo lungo, elenco di testi, sì/no, numero, URL. Riferimenti a file, a
// metaobject o a prodotti (le «Disposizione», «Colore» della tassonomia
// Shopify, i correlati) restano fuori: si scelgono nell'admin del negozio.
//
// Le definizioni si leggono una volta al giorno e si tengono in
// `NegozioShopify.definizioniMetafield`; l'import le rinfresca a ogni giro.

import { prisma } from "./db";
import { chiaveDef, etichettaDef, listaDa, type DefinizioneMetafield } from "./metafield-puro";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

export { chiaveDef, etichettaDef, listaDa, type DefinizioneMetafield };

export const TIPI_COMPILABILI = new Set([
  "single_line_text_field",
  "multi_line_text_field",
  "list.single_line_text_field",
  "boolean",
  "number_integer",
  "number_decimal",
  "url",
]);

/** Namespace delle app e di Shopify: non sono campi nostri. */
function namespaceDiTerzi(ns: string): boolean {
  return ns.startsWith("shopify") || ns.startsWith("mm-") || ns.startsWith("app--");
}

/** Legge le definizioni dal negozio (serve `read_products`; verificato il 04/09 sui tre token). */
export async function leggiDefinizioniDalNegozio(negozio: { dominio: string; token: string }): Promise<DefinizioneMetafield[]> {
  const r = await graphqlNegozio(
    negozio.dominio,
    negozio.token,
    `{ metafieldDefinitions(first: 100, ownerType: PRODUCT) {
         nodes { namespace key name description pinnedPosition type { name } validations { name value } }
       } }`,
    {}
  );
  const err = erroriDi(r, "metafieldDefinitions");
  if (err.length) throw new Error(err.join(" · "));
  const nodi =
    ((r.corpo.data?.metafieldDefinitions as { nodes?: Record<string, unknown>[] } | null)?.nodes ?? []) as {
      namespace: string;
      key: string;
      name: string;
      description: string | null;
      pinnedPosition: number | null;
      type: { name: string };
      validations: { name: string; value: string }[];
    }[];
  const fuori: DefinizioneMetafield[] = [];
  for (const n of nodi) {
    if (namespaceDiTerzi(n.namespace) || !TIPI_COMPILABILI.has(n.type.name)) continue;
    const v = (nome: string) => n.validations.find((x) => x.name === nome)?.value ?? null;
    let scelte: string[] | null = null;
    const sceltaGrezza = v("choices");
    if (sceltaGrezza) {
      try {
        const lista = JSON.parse(sceltaGrezza);
        if (Array.isArray(lista)) scelte = lista.map(String);
      } catch {
        scelte = null;
      }
    }
    const numero = (s: string | null) => (s != null && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null);
    fuori.push({
      namespace: n.namespace,
      key: n.key,
      nome: n.name,
      descrizione: n.description || null,
      tipo: n.type.name,
      scelte,
      min: numero(v("min")),
      max: numero(v("max")),
      posizione: n.pinnedPosition,
    });
  }
  // Prima quelle appuntate nell'admin (nell'ordine dell'admin), poi le altre per nome.
  fuori.sort((a, b) => {
    if (a.posizione != null && b.posizione != null) return a.posizione - b.posizione;
    if (a.posizione != null) return -1;
    if (b.posizione != null) return 1;
    return etichettaDef(a).localeCompare(etichettaDef(b));
  });
  return fuori;
}

const UN_GIORNO = 24 * 3_600_000;

/**
 * Le definizioni di un negozio, dalla cache di un giorno; `forza` le rilegge
 * (lo fa l'import). Se il negozio non risponde si torna quello che c'era, e
 * senza niente in cache una lista vuota: il modulo lo dice invece di
 * inventare campi.
 */
export async function definizioniDelNegozio(
  negozio: { id: string; nome: string; dominio: string; token: string },
  opzioni?: { forza?: boolean }
): Promise<DefinizioneMetafield[]> {
  const riga = await prisma.negozioShopify.findUnique({
    where: { id: negozio.id },
    select: { definizioniMetafield: true, definizioniMetafieldIl: true },
  });
  const inCache = Array.isArray(riga?.definizioniMetafield) ? (riga.definizioniMetafield as unknown as DefinizioneMetafield[]) : null;
  const fresca = riga?.definizioniMetafieldIl && Date.now() - riga.definizioniMetafieldIl.getTime() < UN_GIORNO;
  if (inCache && fresca && !opzioni?.forza) return inCache;
  try {
    const lette = await leggiDefinizioniDalNegozio(negozio);
    await prisma.negozioShopify.update({
      where: { id: negozio.id },
      data: { definizioniMetafield: lette as unknown as object[], definizioniMetafieldIl: new Date() },
    });
    return lette;
  } catch {
    return inCache ?? [];
  }
}

/** Le definizioni già in cache di un negozio dato il nome (per le pagine: nessuna chiamata a Shopify). */
export async function definizioniInCache(nomeNegozio: string): Promise<DefinizioneMetafield[]> {
  const riga = await prisma.negozioShopify.findFirst({
    where: { nome: nomeNegozio },
    select: { definizioniMetafield: true },
  });
  return Array.isArray(riga?.definizioniMetafield) ? (riga.definizioniMetafield as unknown as DefinizioneMetafield[]) : [];
}

/** Gli alias GraphQL per leggere i valori di queste definizioni su un prodotto. */
export function aliasGraphql(defs: DefinizioneMetafield[]): string {
  return defs
    .map((d, i) => `mf_${i}: metafield(namespace: ${JSON.stringify(d.namespace)}, key: ${JSON.stringify(d.key)}) { value }`)
    .join("\n             ");
}

/** Dal nodo prodotto con gli alias sopra all'oggetto `{ "custom.x": valore }` (solo i valorizzati). */
export function valoriDaRisposta(nodo: Record<string, unknown>, defs: DefinizioneMetafield[]): Record<string, string> {
  const fuori: Record<string, string> = {};
  defs.forEach((d, i) => {
    const v = (nodo[`mf_${i}`] as { value?: string } | null | undefined)?.value;
    if (v != null && String(v).trim() !== "") fuori[chiaveDef(d)] = String(v);
  });
  return fuori;
}

/** I valori del modulo pronti per Shopify (`metafields` di productCreate/productUpdate). */
export function metafieldPerShopify(
  valori: Record<string, string>,
  defs: DefinizioneMetafield[]
): { namespace: string; key: string; type: string; value: string }[] {
  const fuori: { namespace: string; key: string; type: string; value: string }[] = [];
  for (const d of defs) {
    const v = valori[chiaveDef(d)];
    if (v == null || v.trim() === "" || v === "[]") continue;
    fuori.push({ namespace: d.namespace, key: d.key, type: d.tipo, value: v });
  }
  return fuori;
}
