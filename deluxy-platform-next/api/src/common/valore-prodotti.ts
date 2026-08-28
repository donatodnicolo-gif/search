/**
 * IL VALORE DELLA MERCE DI UNA CONSEGNA, in un posto solo.
 *
 * ⚠️ Non è `Delivery.productValue`. Quel campo è un numero a sé, che sulle
 * consegne vere **diverge** dalla somma delle righe: misurato il 28/08/2026 su
 * 13.507 vendite, **1.417 (10,5%) hanno i due valori diversi**, per 90.265 € di
 * scarto complessivo — e diverge anche nel database originario (la #62454 ha
 * `productValue` 59,52 con righe che sommano 44,63).
 *
 * ⚠️ La FATTURAZIONE ha sempre usato la somma delle righe, e quello è il numero
 * che finisce sul documento. Qualunque altra schermata che voglia dire «quanto
 * vale questa merce» deve usare **questa** funzione, o dirà al partner un
 * importo che la sua fattura smentisce.
 *
 * La cascata dei ripieghi non è decorativa: il prezzo della riga è la
 * fotografia del giorno, e quando manca si scende al listino — prima quello
 * della variante, poi quello pubblico del prodotto, poi quello base. Senza
 * ripieghi il venduto usciva zero e al partner non risultava dovuto niente
 * (deciso dall'utente il 25-26/08/2026).
 */
export type RigaProdotto = {
  price?: number | null;
  quantity?: number | null;
  productVariant?: { publicPrice?: number | null } | null;
  product?: { publicPrice?: number | null; price?: number | null } | null;
};

export function valoreProdotti(righe: RigaProdotto[] | null | undefined): number {
  return (righe ?? []).reduce(
    (s, p) =>
      s +
      (p.price ?? p.productVariant?.publicPrice ?? p.product?.publicPrice ?? p.product?.price ?? 0) *
        (p.quantity ?? 1),
    0,
  );
}
