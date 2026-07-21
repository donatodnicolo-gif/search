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
