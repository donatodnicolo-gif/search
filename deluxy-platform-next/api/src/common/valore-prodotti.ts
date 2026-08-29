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
 * fotografia del giorno, e quando manca si scende al listino. Senza ripieghi il
 * venduto usciva zero e al partner non risultava dovuto niente (deciso
 * dall'utente il 25-26/08/2026).
 *
 * ⚠️⚠️ **L'ORDINE DEI RIPIEGHI È IL PREZZO DEL PARTNER, NON QUELLO AL PUBBLICO**
 * (29/08/2026). Qui si risponde a «quanto vale la merce **per il partner**», ed
 * è su quel valore che si calcola la sua quota: la fee registrata è il 20%
 * esatto di `ProductVariant.price`, non di `publicPrice`. Ripiegando prima sul
 * pubblico il recap gonfiava il venduto — misurato sul recap di GIUGNO di
 * Maryflor, che il legacy aveva fatturato: 42 consegne su 42 e quota identiche
 * al centesimo, ma merce **7.344 € invece di 6.869 €** (13 righe senza prezzo
 * scritto, +475 €). Su tutto l'archivio: 404 righe di vendita senza prezzo,
 * 200 con pubblico ≠ partner, **+6.560 € (15,1%)**. Verificato prima di
 * cambiare: nessuna variante o prodotto ha `price = 0` con `publicPrice > 0`,
 * quindi anteporre il prezzo partner non porta zeri dove prima c'era un numero.
 */
export type RigaProdotto = {
  price?: number | null;
  quantity?: number | null;
  productVariant?: { price?: number | null; publicPrice?: number | null } | null;
  product?: { publicPrice?: number | null; price?: number | null } | null;
};

export function valoreProdotti(righe: RigaProdotto[] | null | undefined): number {
  return (righe ?? []).reduce(
    (s, p) =>
      s +
      (p.price ??
        p.productVariant?.price ??
        p.productVariant?.publicPrice ??
        p.product?.price ??
        p.product?.publicPrice ??
        0) *
        (p.quantity ?? 1),
    0,
  );
}
