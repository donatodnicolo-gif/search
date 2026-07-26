// Il denaro vive in centesimi interi, in tutta l'app. Un Float su un importo
// prima o poi produce 0.1 + 0.2 = 0.30000000000000004, e su un bonifico non è
// accettabile. Si converte solo ai bordi: quando entra dall'API e quando si
// stampa a schermo.

/**
 * Da quello che arriva dal mondo (numero o stringa, virgola o punto) a
 * centesimi. Torna null se non è un importo valido e positivo.
 * Accetta "1.234,56", "1234.56", 1234.56, "1 234,56".
 */
export function aCentesimi(valore: unknown): number | null {
  if (typeof valore === "number") {
    if (!Number.isFinite(valore) || valore <= 0) return null;
    return Math.round(valore * 100);
  }
  if (typeof valore !== "string") return null;
  let t = valore.trim().replace(/[\s ]/g, "").replace(/[€$]/g, "");
  if (!t) return null;
  // "1.234,56" (italiano) → il punto è separatore di migliaia
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cent = Math.round(n * 100);
  // Tetto tecnico: oltre i 10 milioni di euro è quasi certamente un errore di
  // unità (centesimi passati come euro). Meglio rifiutare che bonificare.
  if (cent > 1_000_000_000) return null;
  return cent;
}

export function euro(cent: number): string {
  return (cent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function euroSemplice(cent: number): string {
  return (cent / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formato SEPA: punto decimale, due cifre, niente separatori di migliaia. */
export function importoSepa(cent: number): string {
  return (cent / 100).toFixed(2);
}
