// **«Attivo» non vuol dire «in vetrina».**
//
// ⚠️⚠️ 11/09/2026 — segnalazione dell'utente: «mi dice pubblicato ma su Shopify
// deluxy.it non lo trovo». Il prodotto c'era, ACTIVE nell'admin, con le sue due
// varianti: quello che mancava era la **pubblicazione sul canale «Online
// Store»**, senza la quale il cliente non lo vede.
//
// La causa, misurata: da **Shopify 2025-10** un prodotto creato via API non
// finisce più da solo sui canali di vendita. La prova sta nelle date — i
// prodotti che il modulo ha creato su Gifts il 10/09, con la versione API
// precedente, sono in vetrina (8 su 9); l'unico creato l'11/09, dopo il
// passaggio a 2025-10, no.
//
// ⚠️ Pubblicare richiede lo scope **`write_publications`**, e leggere i canali
// **`read_publications`**: su Gifts, Flowers e Cake il token non li ha (li ha
// solo Business Deluxy). Finché non ci sono, da qui non si può rimediare — ma
// **si può dire**, ed è la differenza fra un prodotto invisibile e un prodotto
// invisibile che qualcuno sa di dover pubblicare a mano.

import { VERSIONE_API } from "./negozi";

type Accesso = { dominio: string; token: string };

async function chiedi(a: Accesso, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${a.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": a.token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  return (await res.json()) as { data?: Record<string, any>; errors?: unknown };
}

export type EsitoVetrina = {
  /** Vero solo se Shopify dice che il prodotto è sul canale del negozio online. */
  inVetrina: boolean;
  /** L'indirizzo pubblico, quando c'è. */
  indirizzo: string | null;
  /** Che cosa raccontare a chi ha appena salvato. Vuoto se è tutto a posto. */
  avviso: string | null;
};

/**
 * Controlla che un prodotto ACTIVE sia davvero sulla vetrina e, se può, lo
 * pubblica. Non solleva mai: un guasto qui non deve far fallire un salvataggio
 * che per il resto è andato bene.
 */
export async function assicuraInVetrina(accesso: Accesso, shopifyId: string, nomeNegozio: string): Promise<EsitoVetrina> {
  try {
    const stato = await chiedi(accesso, `query($id: ID!) { product(id: $id) { publishedAt onlineStoreUrl } }`, { id: shopifyId });
    const prodotto = stato?.data?.product as { publishedAt: string | null; onlineStoreUrl: string | null } | undefined;
    if (prodotto?.publishedAt) return { inVetrina: true, indirizzo: prodotto.onlineStoreUrl ?? null, avviso: null };

    // Non è in vetrina: proviamo a metterlo noi.
    const canali = await chiedi(accesso, `query { publications(first: 20) { nodes { id name } } }`);
    const nodi = canali?.data?.publications?.nodes as { id: string; name: string }[] | undefined;
    if (!nodi) {
      return {
        inVetrina: false,
        indirizzo: null,
        avviso:
          `${nomeNegozio}: il prodotto è **attivo nell'admin ma non sulla vetrina** — il cliente non lo vede. ` +
          `Da Shopify ${VERSIONE_API} un prodotto creato via API non si pubblica più da solo, e il nostro token di ${nomeNegozio} ` +
          `non ha i permessi «read_publications» e «write_publications» per rimediare. Va pubblicato a mano dall'admin ` +
          `(scheda prodotto → Canali di vendita → Negozio online), oppure si aggiungono quei due permessi all'app del negozio.`,
      };
    }
    const os = nodi.find((x) => /online store/i.test(x.name));
    if (!os) {
      return { inVetrina: false, indirizzo: null, avviso: `${nomeNegozio}: non ha un canale «Negozio online», quindi il prodotto non compare su nessuna vetrina.` };
    }
    const esito = await chiedi(
      accesso,
      `mutation($id: ID!, $pub: ID!) {
        publishablePublish(id: $id, input: { publicationId: $pub }) {
          userErrors { field message }
          publishable { ... on Product { publishedAt onlineStoreUrl } }
        }
      }`,
      { id: shopifyId, pub: os.id },
    );
    const errori = (esito?.data?.publishablePublish?.userErrors ?? []) as { message: string }[];
    if (esito.errors || errori.length) {
      const detto = errori.map((e) => e.message).join(" · ") || JSON.stringify(esito.errors).slice(0, 200);
      return { inVetrina: false, indirizzo: null, avviso: `${nomeNegozio}: non sono riuscito a metterlo in vetrina — ${detto}` };
    }
    const q = esito?.data?.publishablePublish?.publishable as { publishedAt: string | null; onlineStoreUrl: string | null } | undefined;
    return { inVetrina: !!q?.publishedAt, indirizzo: q?.onlineStoreUrl ?? null, avviso: null };
  } catch (e) {
    return {
      inVetrina: false,
      indirizzo: null,
      avviso: `${nomeNegozio}: non ho potuto controllare se il prodotto è in vetrina (${e instanceof Error ? e.message : String(e)}). Conviene guardare sull'admin.`,
    };
  }
}
