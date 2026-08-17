// L'indirizzo dell'ordine dentro Shopify.
//
// Serve perché una parte del lavoro non si fa da qui e non deve farsi da qui:
// rimborsare, modificare le righe, rispedire la conferma, guardare i pagamenti.
// Finora chi doveva aprire l'ordine vero apriva Shopify a mano, sceglieva il
// negozio giusto fra tre e cercava il numero — con `#1733` che esiste su più
// negozi, ogni tanto si finiva sull'ordine di un altro marchio.

/**
 * Il numero interno di Shopify, estratto dal gid.
 *
 * Il gid ha la forma `gid://shopify/Order/5678901234`; l'amministrazione vuole
 * solo la parte finale. Se ci arriva già un numero si prende com'è: i dati
 * vecchi non hanno tutti la stessa forma, e questa funzione non deve essere il
 * posto dove un formato imprevisto diventa un link rotto.
 */
export function idNumericoShopify(shopifyId: string | null | undefined): string {
  const g = (shopifyId ?? '').trim()
  if (!g) return ''
  const ultimo = g.split('/').pop() ?? ''
  return /^\d+$/.test(ultimo) ? ultimo : ''
}

/**
 * Il link alla scheda dell'ordine nell'amministrazione di Shopify.
 *
 * Torna stringa vuota quando non si può costruire — e chi chiama deve NON
 * mostrare il bottone, invece di mostrarne uno che porta a una pagina d'errore.
 *
 * ⚠️ Due forme, e la seconda non è un ripiego inutile: i negozi si identificano
 * col dominio `xxx.myshopify.com` e da lì si ricava la maniglia per
 * `admin.shopify.com/store/<maniglia>`, che è l'indirizzo moderno e quello che
 * funziona quando si è dentro con più negozi. Ma se il dominio salvato fosse
 * quello pubblico (deluxy.it), la maniglia non si può dedurre: si usa allora
 * `<dominio>/admin/orders/<id>`, che Shopify redirige da sé.
 */
export function linkOrdineShopify(
  dominio: string | null | undefined,
  shopifyId: string | null | undefined
): string {
  const d = (dominio ?? '').trim().toLowerCase()
  const id = idNumericoShopify(shopifyId)
  if (!d || !id) return ''
  const m = /^([a-z0-9-]+)\.myshopify\.com$/.exec(d)
  if (m) return `https://admin.shopify.com/store/${m[1]}/orders/${id}`
  return `https://${d}/admin/orders/${id}`
}
