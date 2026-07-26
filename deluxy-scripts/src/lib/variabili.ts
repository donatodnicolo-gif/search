// Come si richiamano le variabili dentro un testo — regola unica dell'app.
//
//   Gentile {{NOME_CLIENTE}}, la aspettiamo il {{DATA}} in {{LUOGO}}.
//
// Si scrive il nome fra due graffe, in MAIUSCOLO con underscore (cifre ammesse,
// non come primo carattere). Gli spazi dentro le graffe sono tollerati
// (`{{ NOME }}` vale `{{NOME}}`), così un copia-incolla sciatto non rompe nulla.
// La sostituzione è testuale: lo stesso segnaposto vale nell'oggetto di
// un'email, nel corpo di un messaggio WhatsApp e nel testo di una presentazione.
//
// Il valore di una variabile, per una data app, si sceglie in quest'ordine:
//   1. il valore impostato in quell'app (tabella ValoreVariabile) — è qui che
//      la firma di Customer Service si distingue da quella del commerciale;
//   2. il valorePredefinito della variabile;
//   3. niente → la variabile risulta MANCANTE e il segnaposto resta com'è, da
//      compilare al momento di mandare il messaggio (il nome del cliente, la
//      data dell'evento: cose che si sanno solo lì per lì).

export const TIPI_VARIABILE = [
  { valore: "testo", nome: "Testo" },
  { valore: "testolungo", nome: "Testo lungo" },
  { valore: "numero", nome: "Numero" },
  { valore: "data", nome: "Data" },
  { valore: "scelta", nome: "Scelta fra opzioni" },
] as const;

export type TipoVariabile = (typeof TIPI_VARIABILE)[number]["valore"];

// Dove finisce il testo. Decide come si copia: per l'email si mostra anche
// l'oggetto e si può aprire il client di posta, per WhatsApp si apre wa.me.
export const CANALI = [
  { valore: "email", nome: "Email" },
  { valore: "whatsapp", nome: "WhatsApp" },
  { valore: "sms", nome: "SMS" },
  { valore: "telefono", nome: "Telefono (copione)" },
  { valore: "presentazione", nome: "Presentazione" },
  { valore: "documento", nome: "Documento" },
  { valore: "altro", nome: "Altro" },
] as const;

// A cosa serve il testo: è il filtro con cui lo si ritrova.
export const CATEGORIE = [
  { valore: "vendite", nome: "Vendite" },
  { valore: "inviti", nome: "Inviti" },
  { valore: "presentazione", nome: "Presentazione aziendale" },
  { valore: "followup", nome: "Follow-up e solleciti" },
  { valore: "assistenza", nome: "Assistenza e reclami" },
  { valore: "altro", nome: "Altro" },
] as const;

// Le variabili che ricorrono in quasi tutti i testi: si propongono quando se ne
// crea uno nuovo, così i nomi restano gli stessi in tutta l'azienda.
export const VARIABILI_COMUNI = [
  "NOME_CLIENTE",
  "AZIENDA",
  "REFERENTE",
  "DATA",
  "ORA",
  "LUOGO",
  "FIRMA",
  "LINK",
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
  origine: "app" | "predefinito" | "mancante";
  obbligatoria: boolean;
};

// Risolve i valori di tutte le variabili di un testo per una data app.
// `valoriApp` è la mappa chiave→valore impostata in quell'app.
export function risolviValori(
  variabili: VariabileMin[],
  valoriApp: Record<string, string | undefined>,
): ValoreRisolto[] {
  return variabili.map((v) => {
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

// Sostituisce i segnaposto con i valori risolti. Quelli senza valore restano
// scritti come sono: meglio un `{{NOME_CLIENTE}}` bene in vista, che si nota
// prima di premere invio, di uno spazio vuoto in mezzo alla frase.
export function componi(corpo: string, valori: ValoreRisolto[]): string {
  const mappa = new Map(valori.filter((v) => v.valore != null).map((v) => [v.chiave, v.valore as string]));
  return corpo.replace(SEGNAPOSTO, (intero, chiave: string) => mappa.get(chiave.toUpperCase()) ?? intero);
}

// Le variabili obbligatorie rimaste senza valore: è quello che l'elenco mostra
// come «da compilare» e che le API restituiscono in `daCompilare`.
export function daCompilare(valori: ValoreRisolto[]): string[] {
  return valori.filter((v) => v.obbligatoria && v.origine === "mancante").map((v) => v.chiave);
}
