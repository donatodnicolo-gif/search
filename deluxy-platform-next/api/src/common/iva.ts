/**
 * L'ALIQUOTA IVA, in un posto solo.
 *
 * ⚠️ Stava dentro `invoices.module.ts`, e finché la leggeva solo la
 * fatturazione andava bene. Dal 28/08/2026 la legge anche il dettaglio
 * consegna, per dire al partner quanto gli resta al netto della nostra
 * commissione: la seconda copia di un'aliquota è il modo in cui due schermate
 * dello stesso applicativo iniziano a dire due numeri diversi.
 *
 * ⚠️ È **22**, non 0,22. Scritto come frazione, un `Math.round(IVA * 100)`
 * stamperebbe «2200%» — errore già commesso.
 */
export const IVA = 22;

/** Imponibile → totale. Arrotonda al centesimo, come tutti gli importi. */
export const conIva = (n: number): number => Math.round(n * (1 + IVA / 100) * 100) / 100;

/** La sola parte di IVA di un imponibile. */
export const soloIva = (n: number): number => Math.round((conIva(n) - n) * 100) / 100;
