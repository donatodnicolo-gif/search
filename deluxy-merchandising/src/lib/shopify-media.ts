// **Foto e video dei prodotti: la loro casa è Shopify Files.**
//
// L'app non ha un deposito di file suo, e non deve averlo: le foto di un
// prodotto vivono sul negozio che lo vende — è lì che il tema le mostra, è lì
// che restano quando il prodotto viene pubblicato. Quindi un file caricato dal
// form entra subito nei **Files** del negozio scelto (`fileCreate`), anche se
// il prodotto non è ancora pubblico; alla pubblicazione si aggancia al prodotto
// con `fileUpdate(referencesToAdd)`, senza ricaricarlo. Vale per le immagini e
// per i video: un file su Shopify si aggancia, un URL esterno per un video no.
//
// Il caricamento è in due tempi, come vuole Shopify: `stagedUploadsCreate` dà
// un indirizzo temporaneo, il file ci si manda sopra (dal browser, così i
// video non passano dal nostro server, che su Vercel accetta 4,5 MB per
// richiesta), poi `fileCreate` lo registra col `resourceUrl`. Shopify lo
// elabora in background: si aspetta `READY` per avere l'URL definitivo.
//
// Tutte le mutation qui dentro sono state validate contro lo schema Admin il
// 04/09/2026 (stagedUploadsCreate, fileCreate, fileUpdate, fileDelete, node).

import { graphqlNegozio, erroriDi, type RispostaShopify } from "./shopify-scrittura";

async function gql(negozio: NegozioConToken, query: string, variables: Record<string, unknown>): Promise<RispostaShopify> {
  return graphqlNegozio(negozio.dominio, negozio.token, query, variables);
}

export type NegozioConToken = { dominio: string; token: string };

export type TipoMedia = "immagine" | "video";

export type BersaglioCaricamento = {
  /** Dove mandare il file (POST multipart con i `parametri` e poi il campo `file`). */
  url: string;
  /** L'indirizzo con cui poi si registra il file. */
  resourceUrl: string;
  parametri: { name: string; value: string }[];
};

export type FileShopify = {
  shopifyFileId: string;
  tipo: TipoMedia;
  /** L'URL definitivo sul CDN (immagine: l'immagine; video: la sorgente mp4). */
  url: string | null;
  /** Un'immagine di anteprima (per i video, il fotogramma di copertina). */
  anteprima: string | null;
  stato: "pronto" | "in-elaborazione" | "fallito";
  errore?: string;
};

export function tipoDaMime(mime: string): TipoMedia | null {
  if (mime.startsWith("image/")) return "immagine";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Tetti dichiarati: oltre, Shopify rifiuta o impiega minuti a elaborare. */
export const LIMITI_MEDIA = {
  immagineByte: 20 * 1024 * 1024,
  videoByte: 500 * 1024 * 1024,
  perProdotto: 12,
};

/** Passo 1: chiede a Shopify dove caricare ogni file. */
export async function preparaCaricamento(
  negozio: NegozioConToken,
  file: { nome: string; mime: string; byte: number }[]
): Promise<{ bersagli: BersaglioCaricamento[]; errore?: string }> {
  const input = file.map((f) => ({
    resource: tipoDaMime(f.mime) === "video" ? "VIDEO" : "IMAGE",
    filename: f.nome,
    mimeType: f.mime,
    httpMethod: "POST",
    // Per i video la dimensione è obbligatoria; per le immagini non guasta.
    fileSize: String(f.byte),
  }));
  const r = await gql(
    negozio,
    `mutation preparaCaricamento($input: [StagedUploadInput!]!) {
       stagedUploadsCreate(input: $input) {
         stagedTargets { url resourceUrl parameters { name value } }
         userErrors { field message }
       }
     }`,
    { input }
  );
  const err = erroriDi(r, "stagedUploadsCreate");
  if (err.length) return { bersagli: [], errore: err.join(" · ") };
  const dati = r.corpo.data?.stagedUploadsCreate as
    | { stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[] }
    | undefined;
  const bersagli = (dati?.stagedTargets ?? []).map((t) => ({
    url: t.url,
    resourceUrl: t.resourceUrl,
    parametri: t.parameters,
  }));
  if (bersagli.length !== file.length) return { bersagli: [], errore: "Shopify non ha dato un indirizzo per ogni file." };
  return { bersagli };
}

/**
 * Passo 2 (lato server, quando il browser non può caricare da solo): manda i
 * byte all'indirizzo temporaneo. Multipart con i parametri PRIMA del file,
 * come richiede lo storage di Shopify.
 */
export async function caricaByteSuBersaglio(
  b: BersaglioCaricamento,
  file: { nome: string; mime: string; byte: ArrayBuffer }
): Promise<{ ok: boolean; errore?: string }> {
  const fd = new FormData();
  for (const p of b.parametri) fd.append(p.name, p.value);
  fd.append("file", new Blob([file.byte], { type: file.mime }), file.nome);
  const res = await fetch(b.url, { method: "POST", body: fd, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) return { ok: false, errore: `Lo storage di Shopify ha risposto ${res.status}.` };
  return { ok: true };
}

/** Passo 3: registra il file caricato fra i Files del negozio. */
export async function registraFile(
  negozio: NegozioConToken,
  file: { resourceUrl: string; tipo: TipoMedia; alt: string }[]
): Promise<{ id: string[]; errore?: string }> {
  const r = await gql(
    negozio,
    `mutation registraFile($files: [FileCreateInput!]!) {
       fileCreate(files: $files) {
         files { id fileStatus alt }
         userErrors { field message }
       }
     }`,
    {
      files: file.map((f) => ({
        originalSource: f.resourceUrl,
        contentType: f.tipo === "video" ? "VIDEO" : "IMAGE",
        alt: f.alt,
      })),
    }
  );
  const err = erroriDi(r, "fileCreate");
  if (err.length) return { id: [], errore: err.join(" · ") };
  const dati = r.corpo.data?.fileCreate as { files: { id: string }[] } | undefined;
  return { id: (dati?.files ?? []).map((f) => f.id) };
}

/** Lo stato di un file e, quando è pronto, i suoi URL. */
export async function statoFile(negozio: NegozioConToken, id: string): Promise<FileShopify> {
  const tipo: TipoMedia = id.includes("/Video/") ? "video" : "immagine";
  const r = await gql(
    negozio,
    `query statoFile($id: ID!) {
       node(id: $id) {
         ... on File { fileStatus fileErrors { code message } preview { image { url } } }
         ... on MediaImage { image { url } }
         ... on Video { sources { url mimeType format } }
       }
     }`,
    { id }
  );
  const n = r.corpo.data?.node as
    | {
        fileStatus?: string;
        fileErrors?: { code: string; message: string }[];
        preview?: { image?: { url?: string } | null } | null;
        image?: { url?: string } | null;
        sources?: { url: string; mimeType: string; format: string }[];
      }
    | null
    | undefined;
  if (!n) return { shopifyFileId: id, tipo, url: null, anteprima: null, stato: "fallito", errore: erroriDi(r, "node").join(" · ") || "File non trovato." };
  const anteprima = n.preview?.image?.url ?? null;
  if (n.fileStatus === "FAILED") {
    return {
      shopifyFileId: id,
      tipo,
      url: null,
      anteprima,
      stato: "fallito",
      errore: (n.fileErrors ?? []).map((e) => e.message).join(" · ") || "Shopify non è riuscito a elaborare il file.",
    };
  }
  if (n.fileStatus !== "READY") return { shopifyFileId: id, tipo, url: null, anteprima, stato: "in-elaborazione" };
  // Per i video si prende la sorgente mp4 più leggera che Shopify ha prodotto:
  // è quella che si può rileggere ovunque.
  const sorgente =
    tipo === "video"
      ? (n.sources ?? []).find((s) => s.format === "mp4")?.url ?? n.sources?.[0]?.url ?? null
      : n.image?.url ?? anteprima;
  return { shopifyFileId: id, tipo, url: sorgente ?? null, anteprima, stato: "pronto" };
}

/**
 * Aspetta che Shopify finisca di elaborare, fino a `massimoMs`. Un'immagine è
 * pronta in pochi secondi; un video può volerci più del tempo di una richiesta:
 * in quel caso si torna «in elaborazione» e l'URL si legge dopo.
 */
export async function attendiFile(negozio: NegozioConToken, id: string, massimoMs = 20_000): Promise<FileShopify> {
  const inizio = Date.now();
  let attesa = 800;
  for (;;) {
    const s = await statoFile(negozio, id);
    if (s.stato !== "in-elaborazione" || Date.now() - inizio > massimoMs) return s;
    await new Promise((r) => setTimeout(r, attesa));
    attesa = Math.min(3000, Math.round(attesa * 1.5));
  }
}

/** Aggancia file già nei Files del negozio a un prodotto (immagini e video). */
export async function agganciaFileAlProdotto(
  negozio: NegozioConToken,
  fileId: string[],
  prodottoShopifyId: string
): Promise<{ ok: boolean; errore?: string }> {
  if (fileId.length === 0) return { ok: true };
  const r = await gql(
    negozio,
    `mutation agganciaFile($files: [FileUpdateInput!]!) {
       fileUpdate(files: $files) {
         files { id }
         userErrors { field message code }
       }
     }`,
    { files: fileId.map((id) => ({ id, referencesToAdd: [prodottoShopifyId] })) }
  );
  const err = erroriDi(r, "fileUpdate");
  return err.length ? { ok: false, errore: err.join(" · ") } : { ok: true };
}

/** Toglie un file dai Files del negozio (serve quando si annulla un caricamento). */
export async function eliminaFile(negozio: NegozioConToken, fileId: string[]): Promise<{ ok: boolean; errore?: string }> {
  if (fileId.length === 0) return { ok: true };
  const r = await gql(
    negozio,
    `mutation eliminaFile($ids: [ID!]!) {
       fileDelete(fileIds: $ids) { deletedFileIds userErrors { field message } }
     }`,
    { ids: fileId }
  );
  const err = erroriDi(r, "fileDelete");
  return err.length ? { ok: false, errore: err.join(" · ") } : { ok: true };
}

/** Mette il prodotto in una collezione manuale del negozio. */
export async function aggiungiProdottoACollezione(
  negozio: NegozioConToken,
  collezioneShopifyId: string,
  prodottoShopifyId: string
): Promise<{ ok: boolean; errore?: string }> {
  const r = await gql(
    negozio,
    `mutation aggiungiAllaCollezione($id: ID!, $productIds: [ID!]!) {
       collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
     }`,
    { id: collezioneShopifyId, productIds: [prodottoShopifyId] }
  );
  const err = erroriDi(r, "collectionAddProducts");
  return err.length ? { ok: false, errore: err.join(" · ") } : { ok: true };
}
