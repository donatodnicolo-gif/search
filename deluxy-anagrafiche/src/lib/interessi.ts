// Linee di interesse commerciale (multi-scelta). Il MASTER è Deluxy Scout:
// `src/lib/linee.ts` le legge live dalla sua API. Questa lista è il FALLBACK,
// allineato alle 9 linee master, usata quando il master non risponde o nei
// contesti senza fetch (client). Il valore memorizzato è il nome canonico.
export const INTERESSI = [
  "Affiliazioni",
  "Clientelling",
  "Concierge",
  "Consegne",
  "Eventi & Catering",
  "Food Supplier",
  "Gifting",
  "Magazzino",
  "Re-seller",
] as const;

// Catalogo dinamico: una linea è una stringa qualsiasi (il nome canonico Scout).
export type Interesse = string;

// Colore stabile per una linea, derivato dal nome: vale anche per linee nuove
// aggiunte in Scout, senza doverle mappare a mano.
const PALETTE_INTERESSE = [
  "var(--gold)",
  "var(--gold-strong)",
  "var(--purple)",
  "var(--orange)",
  "var(--blue)",
  "var(--green)",
  "var(--red)",
  "var(--text-secondary)",
];
export function coloreInteresse(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETTE_INTERESSE[h % PALETTE_INTERESSE.length];
}

// Linee che indicano affiliato/reseller (per il nome in rubrica Google:
// a questi si aggiunge la provincia).
export function eAffiliatoReseller(interessi: string[]): boolean {
  return interessi.includes("Affiliazioni") || interessi.includes("Re-seller");
}

// ————————————————————— Regola: chi entra dai fornitori è affiliato —————————————————————
// L'app di ricerca fornitori (search/suppliers) registra i fiorai e le
// pasticcerie con cui lavoriamo davvero: un'anagrafica che entra o passa di lì
// è per definizione un'affiliazione. L'interesse si AGGIUNGE (mai sostituito,
// mai tolto): resta poi modificabile a mano dal registro.
export const INTERESSE_AFFILIAZIONE = "Affiliazioni";

export function eRicercaFornitori(sistema: string): boolean {
  const s = sistema.trim().toLowerCase().replace(/^deluxy-/, "");
  return s.includes("supplier") || s.includes("fornitor") || s === "search" || s.startsWith("search-");
}
