import type { ReactNode } from "react";

// Stati vuoto/errore delle viste (Libro UX&UI cap.6): icona in quadratino
// gold-soft 44px + titolo + frase che insegna. Il tono «errore» diventa una
// card red-soft: un fallimento non è mai una lista vuota grigia.

const ICONE = {
  // Elenco spuntato (vuoto generico / nessun risultato). SVG stroke 1.7 stile SF Symbols.
  elenco: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6.5l1.5 1.5L8 5.5" />
      <path d="M11 6.5h7" />
      <path d="M4 13.5l1.5 1.5L8 12.5" />
      <path d="M11 13.5h7" />
    </svg>
  ),
  // Chiave (pagina chiavi).
  chiave: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="14.5" r="3.5" />
      <path d="M10 12l8-8" />
      <path d="M15 5l2.5 2.5" />
    </svg>
  ),
  // Triangolo di avviso (errore).
  errore: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 3.5L20 18.5H2L11 3.5z" />
      <path d="M11 9v4" />
      <path d="M11 15.8v.2" />
    </svg>
  ),
} as const;

export function Vuoto({
  titolo,
  icona = "elenco",
  tono = "vuoto",
  children,
}: {
  titolo: string;
  icona?: keyof typeof ICONE;
  tono?: "vuoto" | "errore";
  children?: ReactNode; // la frase che insegna (o l'azione)
}) {
  return (
    <div className={`vuoto${tono === "errore" ? " errore" : ""}`} role={tono === "errore" ? "alert" : undefined}>
      <div className="vuoto-icona">{ICONE[tono === "errore" ? "errore" : icona]}</div>
      <div className="vuoto-titolo">{titolo}</div>
      {children && <div className="vuoto-frase">{children}</div>}
    </div>
  );
}
