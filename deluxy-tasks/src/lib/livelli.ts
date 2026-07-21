import { isPriorita, PESO_PRIORITA, type Priorita } from "./priorita";

// Un livello di priorità con la sua data. Una task può averne più d'uno: es.
// { priorita: "media", data: 30 lug, nota: "ideale" } e
// { priorita: "urgente", data: 22 lug, nota: "limite" }.
export type LivelloInput = {
  priorita: Priorita;
  data: Date | null;
  nota: string | null;
  ordine: number;
};

// Normalizza e valida un array di livelli dal body dell'API. Ritorna la lista
// pulita o un messaggio d'errore.
export function normalizzaLivelli(input: unknown): { errore: string } | { livelli: LivelloInput[] } {
  if (!Array.isArray(input)) return { errore: "livelli deve essere un array" };
  const livelli: LivelloInput[] = [];
  input.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const o = raw as Record<string, unknown>;
    const priorita = o.priorita;
    if (!isPriorita(priorita)) throw new Error(`livelli[${i}].priorita non valida`);
    let data: Date | null = null;
    if (o.data != null) {
      const d = new Date(o.data as string);
      if (isNaN(d.getTime())) throw new Error(`livelli[${i}].data non è una data valida`);
      data = d;
    }
    const nota = typeof o.nota === "string" && o.nota.trim() ? o.nota.trim() : null;
    const ordine = typeof o.ordine === "number" ? o.ordine : i;
    livelli.push({ priorita, data, nota, ordine });
  });
  return { livelli };
}

// Sceglie il livello "effettivo" (quello che determina priorita/scadenza della
// task). Preferenza: la nota indicata; altrimenti la scadenza più vicina;
// a parità, la priorità più alta. Ritorna l'indice, o -1 se lista vuota.
export function indiceLivelloEffettivo(livelli: LivelloInput[], notaPreferita?: string | null): number {
  if (!livelli.length) return -1;
  if (notaPreferita) {
    const i = livelli.findIndex((l) => l.nota?.toLowerCase() === notaPreferita.toLowerCase());
    if (i >= 0) return i;
  }
  let migliore = 0;
  for (let i = 1; i < livelli.length; i++) {
    const a = livelli[migliore];
    const b = livelli[i];
    const da = a.data?.getTime() ?? Infinity;
    const db = b.data?.getTime() ?? Infinity;
    if (db < da) migliore = i;
    else if (db === da && (PESO_PRIORITA[b.priorita] ?? 9) < (PESO_PRIORITA[a.priorita] ?? 9)) migliore = i;
  }
  return migliore;
}
