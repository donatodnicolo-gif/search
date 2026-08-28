"use client";

import { useEffect } from "react";

export function Modale({
  titolo,
  sottotitolo,
  onClose,
  children,
}: {
  titolo: string;
  sottotitolo?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {/* Testata sticky con la ✕ obbligatoria: la chiusura non finisce mai
            sotto la piega quando il corpo scorre (Libro UX&UI v1.7 §9). */}
        <div className="modal-testata">
          <div>
            <h2>{titolo}</h2>
            {sottotitolo && <p className="sub">{sottotitolo}</p>}
          </div>
          <button type="button" className="modal-chiudi" aria-label="Chiudi" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
