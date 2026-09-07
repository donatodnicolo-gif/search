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
  /** ⭐ 05/09/2026: riga SENZA FEE — vale nel venduto, non nella base della quota. */
  withoutCommission?: boolean | null;
  productVariant?: { price?: number | null; publicPrice?: number | null } | null;
  product?: { publicPrice?: number | null; price?: number | null } | null;
};

/**
 * ⚠️ Ultimo ripiego, DICHIARATO: se le righe sommano ZERO ma la consegna porta
 * un `productValue`, vale quello. Misurato il 29/08/2026: **59 vendite
 * (3.648 €)** hanno le righe a zero e il campo pieno — senza questo gradino la
 * fattura direbbe al partner che non gli dobbiamo niente. Non è il campo che
 * torna a comandare: comanda solo dove le righe non dicono nulla.
 */
export function valoreProdotti(
  righe: RigaProdotto[] | null | undefined,
  productValue?: number | null,
): number {
  const somma = sommaRighe(righe);
  if (somma === 0 && (productValue ?? 0) > 0) return productValue as number;
  return somma;
}

/**
 * ⭐ 05/09/2026 (regola utente): LA BASE SU CUI SI CALCOLA LA FEE.
 *
 * È il venduto MENO le righe marcate «senza fee»: su quelle Deluxy non
 * trattiene niente, e in fattura la quota per quelle righe è zero. Il venduto
 * intero resta `valoreProdotti` — è quanto è dovuto al partner — e non cambia.
 *
 * ⚠️ Se TUTTE le righe sono senza fee la base è 0, e 0 è la risposta giusta:
 * qui NON si ripiega su `productValue` come fa `valoreProdotti`, perché quel
 * ripiego serve a non perdere un venduto scritto altrove, mentre qui il vuoto
 * è voluto. Senza righe (consegna vecchia con solo il campo) vale il campo,
 * come prima: nessuna riga da escludere.
 */
export function baseFee(
  righe: RigaProdotto[] | null | undefined,
  productValue?: number | null,
): number {
  if (!righe?.length) return valoreProdotti(righe, productValue);
  return sommaRighe(righe.filter((r) => !r.withoutCommission));
}

function sommaRighe(righe: RigaProdotto[] | null | undefined): number {
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
