export const MESI = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// ⚠️⚠️ **`useGrouping: "always"` NON è pignoleria** (30/08/2026, segnalato
// dall'utente su una riga del conto economico: «5976» invece di «5.976»).
// L'italiano di CLDR ha `minimumGroupingDigits = 2`: `toLocaleString("it-IT")` da solo
// **non separa i numeri di quattro cifre**, quindi nella stessa colonna
// convivevano «10.860» e «6895» — la stessa grandezza scritta in due modi, e
// l'occhio legge la seconda come un numero più piccolo di quello che è.
// Non è un difetto di questa app: è il comportamento predefinito, ed è per
// questo che ogni importo deve passare da qui e non da un `toLocaleString`
// scritto sul posto. La stessa correzione era già stata fatta **a mano** in
// `LineeEditor.tsx`: una regola in due punti che diverge, esattamente il difetto
// che questa app ha già pagato altre volte.
const GRUPPI = { useGrouping: "always" } as const;

export function eur(v: number, decimals = 0): string {
  return v.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...GRUPPI,
  });
}

export function pct(v: number, decimals = 1): string {
  return `${v.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...GRUPPI,
  })}%`;
}

export function num(v: number): string {
  return v.toLocaleString("it-IT", { maximumFractionDigits: 0, ...GRUPPI });
}
