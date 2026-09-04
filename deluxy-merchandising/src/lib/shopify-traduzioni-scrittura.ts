// **Scrivere le traduzioni di un prodotto sul negozio.**
//
// Shopify vuole, per ogni voce tradotta, il `digest` del testo originale: lo si
// legge con `translatableResource` e lo si rimanda con `translationsRegister`.
// Serve `write_translations`, che i tre token hanno. Le locale valide sono
// solo quelle configurate sul negozio: una lingua che il negozio non ha viene
// rifiutata con un userError, e qui si riporta senza far fallire le altre.
// (Mutation e query validate contro lo schema Admin il 04/09/2026.)

import type { Traduzione } from "./ai-traduzioni";
import { erroriDi, graphqlNegozio } from "./shopify-scrittura";

export async function registraTraduzioniProdotto(
  negozio: { dominio: string; token: string },
  prodottoShopifyId: string,
  traduzioni: Traduzione[]
): Promise<{ scritte: number; errori: string[] }> {
  const lettura = await graphqlNegozio(
    negozio.dominio,
    negozio.token,
    `query contenutoTraducibile($id: ID!) {
       translatableResource(resourceId: $id) {
         resourceId
         translatableContent { key value digest locale }
       }
     }`,
    { id: prodottoShopifyId }
  );
  const errLettura = erroriDi(lettura, "translatableResource");
  if (errLettura.length) return { scritte: 0, errori: errLettura };
  const contenuto = (lettura.corpo.data?.translatableResource as { translatableContent?: { key: string; digest: string }[] } | null)
    ?.translatableContent ?? [];
  const digest = new Map(contenuto.map((c) => [c.key, c.digest]));
  const digestTitolo = digest.get("title");
  const digestCorpo = digest.get("body_html");
  if (!digestTitolo) return { scritte: 0, errori: ["Il negozio non espone il titolo come traducibile."] };

  const voci: { locale: string; key: string; value: string; translatableContentDigest: string }[] = [];
  for (const t of traduzioni) {
    voci.push({ locale: t.locale, key: "title", value: t.titolo, translatableContentDigest: digestTitolo });
    if (digestCorpo && t.descrizione) {
      voci.push({
        locale: t.locale,
        key: "body_html",
        value: t.descrizione.replace(/\n/g, "<br>"),
        translatableContentDigest: digestCorpo,
      });
    }
  }
  if (voci.length === 0) return { scritte: 0, errori: [] };

  const r = await graphqlNegozio(
    negozio.dominio,
    negozio.token,
    `mutation registraTraduzioni($id: ID!, $translations: [TranslationInput!]!) {
       translationsRegister(resourceId: $id, translations: $translations) {
         translations { locale key }
         userErrors { field message }
       }
     }`,
    { id: prodottoShopifyId, translations: voci }
  );
  const errori = erroriDi(r, "translationsRegister");
  const scritte = ((r.corpo.data?.translationsRegister as { translations?: unknown[] } | null)?.translations ?? []).length;
  // Con una lingua non configurata Shopify rifiuta TUTTO il lotto: si riprova
  // lingua per lingua, così le altre passano e si sa quale è stata rifiutata.
  if (errori.length && scritte === 0 && traduzioni.length > 1) {
    let ok = 0;
    const rifiutate: string[] = [];
    for (const t of traduzioni) {
      const singola = await registraTraduzioniProdotto(negozio, prodottoShopifyId, [t]);
      if (singola.scritte > 0) ok += singola.scritte;
      else rifiutate.push(`${t.locale}: ${singola.errori.join(" · ") || "rifiutata"}`);
    }
    return { scritte: ok, errori: rifiutate };
  }
  return { scritte, errori };
}
