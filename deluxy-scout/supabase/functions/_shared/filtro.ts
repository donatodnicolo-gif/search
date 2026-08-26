// COME SI METTE UN TESTO DENTRO UN FILTRO PostgREST, una volta sola.
//
// ⚠️ In un `.or(...)` la VIRGOLA separa le condizioni, le PARENTESI raggruppano
// e il `%` è il jolly di `ilike`. `supabase-js` non mette le virgolette attorno
// ai valori: li interpola e basta (il suo stesso docblock dice di aspettarsi
// «raw PostgREST syntax for the filter names AND values»).
//
// Il conto pagato: cercando un negozio che si chiama «Fiorami, Milano» il
// filtro si spezzava, PostgREST rispondeva 400, e siccome l'errore non veniva
// letto la lista risultava semplicemente VUOTA. Un negozio che c'era veniva
// dichiarato inesistente — e poiché con zero candidati l'unica strada offerta
// è «crealo», si generava un DOPPIONE. Lo stesso valeva per l'auto-qualifica:
// un contatto scritto «info@tizio.it, tel 333» rompeva la ricerca e faceva
// nascere un negozio nuovo invece di agganciare quello esistente.
//
// La stessa difesa esiste già nell'app (`lib/ricerca.ts`): qui è la sua gemella
// per il lato server, perché da Deno il codice dell'app non si importa.

/** Toglie da un termine i caratteri che PostgREST leggerebbe come sintassi. */
export function pulisciFiltro(term: string): string {
  return term
    .trim()
    .replace(/[,()%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un'email è utilizzabile in un filtro solo se ha la forma di un'email. */
export function emailValida(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return /^[^\s@,()%\\]+@[^\s@,()%\\]+\.[^\s@,()%\\]+$/.test(s) ? s : null;
}
