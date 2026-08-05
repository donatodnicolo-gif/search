// Le **scritture** verso l'Admin API di un negozio collegato.
//
// Sta in un modulo suo e non dentro un file `"use server"` per un motivo di
// sostanza: in un file di server action **ogni export diventa un endpoint**, e
// una funzione che manda una GraphQL qualunque al negozio non deve essere
// chiamabile dall'esterno. Qui è una funzione interna, usata dalle azioni.

import { VERSIONE_API } from "./negozi";

export type RispostaShopify = {
  status: number;
  corpo: {
    data?: Record<string, ({ userErrors?: { message: string }[] } & Record<string, unknown>) | null>;
    errors?: { message: string }[];
  };
};

export async function graphqlNegozio(
  dominio: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<RispostaShopify> {
  const res = await fetch(`https://${dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  const corpo = (await res.json().catch(() => ({}))) as RispostaShopify["corpo"];
  return { status: res.status, corpo };
}

/**
 * Gli errori di una mutation, sia quelli di GraphQL sia gli `userErrors` che
 * Shopify mette **dentro** una risposta con HTTP 200. Guardare solo i primi è il
 * modo classico di credere che sia andata bene quando non è andata.
 */
export function erroriDi(r: RispostaShopify, campo: string): string[] {
  const dati = r.corpo.data?.[campo];
  return [
    ...(r.corpo.errors ?? []).map((e) => e.message),
    ...((dati?.userErrors as { message: string }[] | undefined) ?? []).map((e) => e.message),
  ];
}
