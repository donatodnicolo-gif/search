// Le app di origine che possono mandare task. Serve per etichettare e
// colorare la provenienza nella UI. La chiave `sistema` è libera lato API
// (un'app nuova può mandare da subito), ma queste sono quelle note.

export const SISTEMI: Record<string, { nome: string; colore: string }> = {
  platform: { nome: "Consegne", colore: "var(--ink)" },
  scout: { nome: "Scout", colore: "var(--blue)" },
  mail: { nome: "AI Mail", colore: "var(--purple)" },
  partner: { nome: "Finance", colore: "var(--green)" },
  budgets: { nome: "Budgets", colore: "var(--gold-strong)" },
  anagrafiche: { nome: "Anagrafiche", colore: "var(--orange)" },
  suppliers: { nome: "Fornitori", colore: "var(--blue)" },
  search: { nome: "Ricerca", colore: "var(--blue)" },
  hub: { nome: "Hub", colore: "var(--ink)" },
  tasks: { nome: "Tasks", colore: "var(--gold)" },
};

export function etichettaSistema(sistema: string): string {
  return SISTEMI[sistema]?.nome ?? sistema;
}

export function coloreSistema(sistema: string): string {
  return SISTEMI[sistema]?.colore ?? "var(--text-secondary)";
}
