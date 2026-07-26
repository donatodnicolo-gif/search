// Come si richiamano le variabili dentro uno script — regola unica dell'app.
//
//   {{NOME_VARIABILE}}
//
// Si scrive il nome fra due graffe, in MAIUSCOLO con underscore (cifre ammesse,
// non come primo carattere). Gli spazi dentro le graffe sono tollerati
// (`{{ NOME }}` vale `{{NOME}}`), così un copia-incolla sciatto non rompe nulla.
// La sostituzione è testuale: funziona in JavaScript, SQL, bash, Liquid, YAML e
// in qualsiasi altro linguaggio, perché non c'è nessun parser di mezzo.
//
// Il valore di una variabile, per una data app, si sceglie in quest'ordine:
//   1. il valore impostato in quell'app (tabella ValoreVariabile);
//   2. il valorePredefinito della variabile;
//   3. niente → la variabile risulta MANCANTE e il segnaposto resta com'è.
//
// Le variabili di tipo `segreto` (token, password, chiavi API) non conservano
// mai un valore nel database: restano segnaposto e si compilano al momento
// dell'uso, nel riquadro «Copia lo script» — così un segreto non finisce né in
// questo database né nelle risposte delle API.

export const TIPI_VARIABILE = [
  { valore: "testo", nome: "Testo" },
  { valore: "testolungo", nome: "Testo lungo" },
  { valore: "numero", nome: "Numero" },
  { valore: "booleano", nome: "Vero / Falso" },
  { valore: "scelta", nome: "Scelta fra opzioni" },
  { valore: "segreto", nome: "Segreto (non salvato)" },
] as const;

export type TipoVariabile = (typeof TIPI_VARIABILE)[number]["valore"];

export const LINGUAGGI = [
  { valore: "javascript", nome: "JavaScript" },
  { valore: "typescript", nome: "TypeScript" },
  { valore: "sql", nome: "SQL" },
  { valore: "bash", nome: "Bash" },
  { valore: "powershell", nome: "PowerShell" },
  { valore: "python", nome: "Python" },
  { valore: "liquid", nome: "Liquid (temi Shopify)" },
  { valore: "altro", nome: "Altro" },
] as const;

// Un segnaposto: due graffe, nome, due graffe. Spazi tollerati ai lati del nome.
const SEGNAPOSTO = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

// Tutte le chiavi usate nel corpo, in ordine di prima comparsa e senza doppioni.
export function chiaviUsate(corpo: string): string[] {
  const viste = new Set<string>();
  for (const m of corpo.matchAll(SEGNAPOSTO)) viste.add(m[1].toUpperCase());
  return [...viste];
}

// Normalizza quello che scrive l'utente nel campo "chiave": MAIUSCOLO, spazi e
// segni diventano underscore, niente cifra iniziale.
export function normalizzaChiave(grezza: string): string {
  const pulita = grezza
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!pulita) return "";
  return /^[0-9]/.test(pulita) ? `V_${pulita}` : pulita;
}

export function segnaposto(chiave: string): string {
  return `{{${chiave}}}`;
}

export type VariabileMin = {
  chiave: string;
  tipo: string;
  valorePredefinito: string | null;
  obbligatoria: boolean;
};

export type ValoreRisolto = {
  chiave: string;
  tipo: string;
  valore: string | null; // null = nessun valore disponibile
  origine: "app" | "predefinito" | "segreto" | "mancante";
  obbligatoria: boolean;
};

// Risolve i valori di tutte le variabili di uno script per una data app.
// `valoriApp` è la mappa chiave→valore impostata in quell'app.
export function risolviValori(
  variabili: VariabileMin[],
  valoriApp: Record<string, string | undefined>,
): ValoreRisolto[] {
  return variabili.map((v) => {
    if (v.tipo === "segreto") {
      return { chiave: v.chiave, tipo: v.tipo, valore: null, origine: "segreto" as const, obbligatoria: v.obbligatoria };
    }
    const perApp = valoriApp[v.chiave];
    if (perApp != null && perApp !== "") {
      return { chiave: v.chiave, tipo: v.tipo, valore: perApp, origine: "app" as const, obbligatoria: v.obbligatoria };
    }
    const predefinito = v.valorePredefinito;
    if (predefinito != null && predefinito !== "") {
      return {
        chiave: v.chiave,
        tipo: v.tipo,
        valore: predefinito,
        origine: "predefinito" as const,
        obbligatoria: v.obbligatoria,
      };
    }
    return { chiave: v.chiave, tipo: v.tipo, valore: null, origine: "mancante" as const, obbligatoria: v.obbligatoria };
  });
}

// Sostituisce i segnaposto con i valori risolti. Quelli senza valore (segreti e
// mancanti) restano scritti come sono: lo script non viene mai consegnato con
// un buco muto al posto di un valore.
export function componi(corpo: string, valori: ValoreRisolto[]): string {
  const mappa = new Map(valori.filter((v) => v.valore != null).map((v) => [v.chiave, v.valore as string]));
  return corpo.replace(SEGNAPOSTO, (intero, chiave: string) => mappa.get(chiave.toUpperCase()) ?? intero);
}

// Le variabili obbligatorie rimaste senza valore: è quello che l'elenco mostra
// come «da compilare» e che le API restituiscono in `daCompilare`.
export function daCompilare(valori: ValoreRisolto[]): string[] {
  return valori
    .filter((v) => v.obbligatoria && (v.origine === "mancante" || v.origine === "segreto"))
    .map((v) => v.chiave);
}
