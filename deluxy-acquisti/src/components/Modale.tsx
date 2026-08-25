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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titolo}</h2>
        {sottotitolo && <p className="sub">{sottotitolo}</p>}
        {children}
      </div>
    </div>
  );
}
