// Gli `errors` di una risposta GraphQL di Shopify, ridotti a una forma sola.
//
// Perché esiste (10/09/2026): l'import delle collezioni delle 10:17 è morto su
// tre negozi con «g.errors?.some is not a function» — `g` è il nome minificato
// di `corpo`. Shopify, in certi guasti suoi, mette in `errors` **una stringa**
// («Internal Server Error», «Not Found») o un oggetto (`{"query":"…"}`), non la
// lista che il tipo dichiarava. Quattro punti della lib facevano `.some`,
// `.map` o `.length` su quel campo e trasformavano un errore transitorio del
// negozio in un TypeError nostro, che copriva il messaggio vero. Da qui in poi
// si passa tutto da questa funzione, e il messaggio di Shopify resta leggibile.
export type ErroreGraphql = { message: string; extensions?: { code?: string } };

export function erroriGraphql(errors: unknown): ErroreGraphql[] {
  if (errors == null) return [];
  if (Array.isArray(errors)) {
    return errors.map((e) => {
      if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
        return e as ErroreGraphql;
      }
      return { message: typeof e === "string" ? e : JSON.stringify(e) };
    });
  }
  if (typeof errors === "string") return [{ message: errors }];
  if (typeof errors === "object") {
    const voci = Object.entries(errors as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`
    );
    return [{ message: voci.join(" · ") || JSON.stringify(errors) }];
  }
  return [{ message: String(errors) }];
}
