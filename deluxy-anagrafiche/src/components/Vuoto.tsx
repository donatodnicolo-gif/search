import type { ReactNode } from "react";

/* Empty-state al canone del Libro (§6): icona in quadratino gold-soft 44px +
   titolo title-m + frase che insegna. Prima .vuoto era solo una riga di testo
   centrata, senza icona né titolo. 27/08 */
export function Vuoto({
  titolo,
  children,
}: {
  titolo: string;
  children: ReactNode;
}) {
  return (
    <div className="vuoto">
      <span className="vuoto-icona" aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18M3 12h18M3 18h12" />
        </svg>
      </span>
      <div className="vuoto-titolo">{titolo}</div>
      <p className="vuoto-testo">{children}</p>
    </div>
  );
}
