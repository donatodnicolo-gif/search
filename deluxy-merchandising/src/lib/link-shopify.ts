// Gli indirizzi di una scheda **sul negozio**: dove si modifica (admin) e dove
// la vede il cliente (sito).
//
// Si passa sempre dal dominio `*.myshopify.com` e non dal dominio pubblico: il
// primo lo conosciamo per ogni negozio collegato, il secondo no — e Shopify
// reindirizza da solo (verificato: `deluxygifts.myshopify.com/collections/…` →
// 301 → `deluxy.it/collections/…`). Inventarlo qui vorrebbe dire sbagliarlo per
// i negozi che non l'hanno impostato.

/** Il numero in fondo a un gid: `gid://shopify/Collection/626176262474` → `626176262474`. */
export function idNumerico(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const ultimo = gid.split("/").pop()?.trim();
  return ultimo && /^\d+$/.test(ultimo) ? ultimo : null;
}

/** L'indirizzo della scheda nell'admin del negozio, dove si modificano i campi. */
export function linkAdmin(dominio: string | null | undefined, gid: string | null | undefined, tipo: "prodotto" | "collezione"): string | null {
  const num = idNumerico(gid);
  if (!dominio || !num) return null;
  return `https://${dominio}/admin/${tipo === "prodotto" ? "products" : "collections"}/${num}`;
}

/** L'indirizzo pubblico, com'è per il cliente. */
export function linkSito(dominio: string | null | undefined, handle: string | null | undefined, tipo: "prodotto" | "collezione"): string | null {
  if (!dominio || !handle) return null;
  return `https://${dominio}/${tipo === "prodotto" ? "products" : "collections"}/${handle}`;
}
