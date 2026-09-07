// **Quale foto vince**, quando lo stesso prodotto sta su più negozi.
//
// Il fatto (misurato il 07/09/2026): 1.926 schede hanno lo stesso prodotto su
// due o più negozi con foto diverse, perché ogni negozio ha il suo file caricato
// in un momento suo. `Prodotto.immagine` veniva riscritta dall'import di
// **ogni** negozio, quindi vinceva l'ultimo cron della notte: con l'arrivo di
// «Business Deluxy» (che gira per ultimo) centinaia di schede hanno cominciato a
// mostrare foto vecchie di anni — «Semifreddo ai 3 cioccolati» tornava alla foto
// del 2022 di Gifts al posto di quella del 2024. Da fuori sembrava che l'app non
// si aggiornasse: in realtà si aggiornava fin troppo, all'indietro.
//
// La regola è una sola e sta qui, non ricopiata nei due posti che la usano
// (l'import notturno e `scripts/foto-piu-recente.ts`): **vince la più recente**.

/**
 * Quando quel file è stato caricato, letto dal `?v=<epoch>` che il CDN di
 * Shopify mette in coda all'URL.
 *
 * `-1` = non c'è foto (perde contro tutto). `0` = c'è una foto ma senza `?v=`:
 * perde contro qualunque foto datata, ma batte «nessuna foto», perché una foto
 * senza data è comunque meglio del vuoto.
 */
export function versioneFoto(url: string | null | undefined): number {
  if (!url) return -1;
  const m = url.match(/[?&]v=(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * La foto nuova sostituisce quella che c'è **solo se è più recente**.
 * A parità si tiene quella che c'è: un giro che non cambia niente non deve
 * scrivere, e così l'import resta idempotente.
 */
export function fotoDaTenere(attuale: string | null | undefined, dalNegozio: string | null | undefined): string | undefined {
  if (!dalNegozio) return undefined; // il negozio non ne ha: non si cancella quella che c'è
  if (versioneFoto(dalNegozio) > versioneFoto(attuale)) return dalNegozio;
  return undefined; // `undefined` = Prisma lascia il campo com'è
}
