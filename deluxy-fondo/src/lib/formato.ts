/**
 * Deluxy Fondo — formattazione.
 *
 * Regola unica ma vincolante: `null` non diventa mai «0» né «—» silenzioso. Diventa
 * «non disponibile», così chi legge sa che il dato manca invece di credere che valga zero.
 */

const MANCANTE = "non disponibile";

/** Formattazione italiana: separatore decimale a virgola, non a punto. */
function conVirgola(x: number, decimali: number): string {
  return x.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

export function percentuale(x: number | null | undefined, decimali = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  return `${x >= 0 ? "+" : ""}${conVirgola(x * 100, decimali)}%`;
}

export function punti(x: number | null | undefined, decimali = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  return `${x >= 0 ? "+" : ""}${conVirgola(x * 100, decimali)} pp`;
}

export function numero(x: number | null | undefined, decimali = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  return x.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali });
}

/**
 * Valute espresse in **sottomultipli**: Londra quota in penny, non in sterline.
 *
 * `Intl` normalizza il codice ignorando le maiuscole, quindi `"GBp"` diventa `"GBP"` e 538,50
 * penny finiscono a schermo come «538,50 £» — cento volte il valore vero. È successo davvero
 * su BP, Diageo e Unilever: l'esborso per 100 azioni risultava 45.055 £ invece di 450 £.
 * Queste valute si formattano quindi a mano, con il loro simbolo.
 */
const SOTTOMULTIPLI: Record<string, { simbolo: string; principale: string }> = {
  GBp: { simbolo: "p", principale: "GBP" },
  GBX: { simbolo: "p", principale: "GBP" },
  ZAc: { simbolo: "c", principale: "ZAR" },
  ZAX: { simbolo: "c", principale: "ZAR" },
  ILa: { simbolo: "agorot", principale: "ILS" },
};

function valutaBase(x: number, valuta: string, minimo: number, massimo: number): string {
  return x.toLocaleString("it-IT", {
    style: "currency",
    currency: valuta,
    minimumFractionDigits: minimo,
    maximumFractionDigits: massimo,
  });
}

/**
 * Un **importo** in denaro: sempre due decimali, come su un estratto conto.
 * Non va usata per i prezzi per azione, dove il terzo decimale è informativo.
 *
 * Sui titoli quotati in sottomultiplo l'importo viene riportato alla valuta principale: un
 * controvalore si legge in sterline, non in 45.055 penny. La quotazione per azione resta
 * invece in penny, come la mostra la borsa.
 */
export function prezzo(x: number | null | undefined, valuta = "EUR"): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  const minore = SOTTOMULTIPLI[valuta];
  return minore ? valutaBase(x / 100, minore.principale, 2, 2) : valutaBase(x, valuta, 2, 2);
}

/**
 * Un **prezzo per azione**: fino a tre decimali, perché su un titolo da 21 € il terzo
 * decimale distingue un carico da un altro e non è rumore.
 */
export function prezzoUnitario(x: number | null | undefined, valuta = "EUR"): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  const minore = SOTTOMULTIPLI[valuta];
  if (minore) {
    return `${x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${minore.simbolo}`;
  }
  return valutaBase(x, valuta, 2, 3);
}

export function milioni(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  if (Math.abs(x) >= 1000) return `${(x / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} mld €`;
  return `${x.toLocaleString("it-IT", { maximumFractionDigits: 0 })} mln €`;
}

export function volume(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return MANCANTE;
  if (x >= 1_000_000) return `${(x / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln`;
  if (x >= 1000) return `${(x / 1000).toLocaleString("it-IT", { maximumFractionDigits: 0 })} mila`;
  return x.toLocaleString("it-IT");
}

/** Data ISO `YYYY-MM-DD` → `18 agosto 2026`. */
export function data(iso: string | null | undefined): string {
  if (!iso) return MANCANTE;
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** Data breve `18/08/2026`. */
export function dataBreve(iso: string | null | undefined): string {
  if (!iso) return MANCANTE;
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT");
}

/** Colore semantico di una variazione: verde sopra zero, rosso sotto, grigio se manca. */
export function verso(x: number | null | undefined): "su" | "giu" | "neutro" {
  if (x === null || x === undefined || !Number.isFinite(x)) return "neutro";
  return x > 0 ? "su" : x < 0 ? "giu" : "neutro";
}
