/**
 * IL PREZZO PER IL PARTNER, in un posto solo.
 *
 * Nasce dallo sconto di categoria/provincia (`CategoryDiscount`): lo sconto NON
 * e' un'etichetta, e' proprio il modo in cui si ricava quanto paghiamo al
 * partner, ed e' quel numero che viaggia verso l'app consegne come
 * `costoPartner`.
 *
 *   prezzo partner = importo x (1 - sconto%)  ->  arrotondato a 0/5
 *
 * Arrotondamento AL PIU' VICINO (scelta utente, 01/09/2026): 122 -> 120,
 * 123 -> 125. E' quello che i prodotti scontati automatici gia' facevano dal
 * primo giorno; la regola segue loro invece di crearne una seconda.
 *
 * ⚠️ La regola stava scritta in DUE posti che gia' divergevano: `app-api`
 * (costoPartner, senza nessun arrotondamento) e `products.service` (prodotti
 * scontati, arrotondati a 0/5). Due schermate della stessa app davano due
 * prezzi diversi per lo stesso partner. Ora e' qui, e i due posti la chiamano.
 */

/** Il passo dell'arrotondamento: i prezzi al partner finiscono per 0 o per 5. */
export const PASSO = 5;

/**
 * Arrotonda al multiplo di 5 piu' vicino. 122 -> 120 · 123 -> 125 · 122,50 -> 125
 * (la meta' esatta sale, come vuole `Math.round`).
 */
export function arrotondaA5(n: number): number {
  // Al centesimo prima di dividere: senza, un 122,4999999 uscito da una
  // moltiplicazione in virgola mobile potrebbe cadere dalla parte sbagliata.
  const centesimi = Math.round(n * 100) / 100;
  return Math.round(centesimi / PASSO) * PASSO;
}

/**
 * Quanto paghiamo al partner per una VENDITA (da non confondere con il prezzo
 * di una consegna, che in app-api si chiama `prezzoPartner` ed e' altra cosa).
 * Sconto 0 -> paghiamo l'intero importo, arrotondato lui pure: la regola vale
 * sempre, anche quando lo sconto manca.
 */
export function prezzoAlPartner(importo: number, scontoPercento: number): number {
  return arrotondaA5(importo * (1 - (scontoPercento || 0) / 100));
}
