// Le app di origine che possono mandare task. Serve per etichettare e
// colorare la provenienza nella UI. La chiave `sistema` è libera lato API
// (un'app nuova può mandare da subito), ma queste sono quelle note.

// La provenienza è una CATEGORIA, non uno stato: il Libro UX&UI cap.5 vieta di
// usare i colori semantici come palette categoriale (leggere «pericolo» dove
// c'è «viene da Anagrafiche» è un falso allarme). Finché il DS non ha token
// categoriali dedicati, il badge di provenienza è NEUTRO: testo su --fill.
export const SISTEMI: Record<string, { nome: string }> = {
  platform: { nome: "Consegne" },
  scout: { nome: "Scout" },
  mail: { nome: "AI Mail" },
  partner: { nome: "Finance" },
  budgets: { nome: "Budgets" },
  anagrafiche: { nome: "Anagrafiche" },
  suppliers: { nome: "Fornitori" },
  search: { nome: "Ricerca" },
  hub: { nome: "Hub" },
  tasks: { nome: "Inserita a mano" },
};

// Sistema riservato alle attività create dalla UI di Tasks (bottone «Nuova
// attività»): non appartengono a un'altra app, non hanno `idEsterno`.
export const SISTEMA_UI = "tasks";

export function etichettaSistema(sistema: string): string {
  return SISTEMI[sistema]?.nome ?? sistema;
}
