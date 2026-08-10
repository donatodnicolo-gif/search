// **Le traduzioni di una collezione sul negozio.**
//
// Shopify tiene le lingue in un posto separato dal testo principale: il titolo
// italiano sta sulla collezione, l'inglese in `translations`. Da qui si
// **leggono e basta**: si scrivono nell'admin del negozio, e un'app che le
// riscrivesse di nascosto farebbe danni in una lingua che nessuno qui rilegge.
//
// Il campanello vero è `outdated`: Shopify lo alza quando **l'originale è
// cambiato dopo** la traduzione. Vuol dire che il cliente inglese legge ancora
// il testo vecchio — ed è esattamente il genere di cosa che non si scopre mai
// guardando il sito italiano.

import { graphqlNegozio } from "./shopify-scrittura";

/**
 * Le lingue che si vanno a chiedere. Elenco **fisso e dichiarato**: leggere
 * quelle davvero configurate sul negozio vorrebbe dire `shopLocales`, che
 * chiede lo scope `read_locales` — i token di oggi non ce l'hanno, e Shopify
 * risponde ACCESS_DENIED. Meglio un elenco onesto che una lista vuota che
 * sembra «non ci sono traduzioni».
 */
const LINGUE = [
  { codice: "en", nome: "Inglese" },
  { codice: "fr", nome: "Francese" },
  { codice: "de", nome: "Tedesco" },
  { codice: "es", nome: "Spagnolo" },
  { codice: "ru", nome: "Russo" },
  { codice: "zh-CN", nome: "Cinese" },
  { codice: "ar", nome: "Arabo" },
  { codice: "ja", nome: "Giapponese" },
] as const;

/** Le chiavi che ci interessano, coi nomi che usiamo in pagina. */
const NOMI: Record<string, string> = {
  title: "titolo",
  body_html: "descrizione",
  meta_title: "SEO: titolo",
  meta_description: "SEO: descrizione",
};

export type LinguaTradotta = {
  codice: string;
  nome: string;
  /** Le voci tradotte, coi nomi leggibili. */
  voci: { chiave: string; nome: string; valore: string; daRifare: boolean }[];
};

/**
 * Un giro solo per tutte le lingue: si chiedono con gli alias GraphQL invece
 * di otto chiamate: otto viaggi per una scheda sarebbero secondi di attesa.
 */
export async function traduzioniCollezione(
  dominio: string,
  token: string,
  shopifyId: string,
): Promise<{ lingue: LinguaTradotta[]; errore?: string }> {
  const campi = LINGUE.map(
    (l, i) => `l${i}: translations(locale: "${l.codice}") { key value outdated }`,
  ).join("\n        ");
  try {
    const r = await graphqlNegozio(
      dominio,
      token,
      `query($id: ID!) { collection(id: $id) { ${campi} } }`,
      { id: shopifyId },
    );
    const c = (r.corpo.data as { collection?: Record<string, { key: string; value: string; outdated: boolean }[]> })?.collection;
    if (!c) {
      const err = (r.corpo.errors ?? []).map((e) => e.message).join(" · ");
      return { lingue: [], errore: err || "Il negozio non ha risposto." };
    }
    const lingue: LinguaTradotta[] = [];
    LINGUE.forEach((l, i) => {
      const voci = (c[`l${i}`] ?? [])
        .filter((v) => v.value?.trim())
        .map((v) => ({ chiave: v.key, nome: NOMI[v.key] ?? v.key, valore: v.value, daRifare: v.outdated }));
      if (voci.length) lingue.push({ codice: l.codice, nome: l.nome, voci });
    });
    return { lingue };
  } catch (e) {
    return { lingue: [], errore: e instanceof Error ? e.message : "Errore nella lettura delle traduzioni." };
  }
}
