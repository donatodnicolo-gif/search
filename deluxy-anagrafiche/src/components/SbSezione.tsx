"use client";

import { useEffect, useState } from "react";

// Sezione della sidebar apribile/chiudibile dal click sull'etichetta.
// La preferenza per sezione vive in localStorage.
export function SbSezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  const chiave = `anagrafiche-sezione-${titolo}`;
  const [aperta, setAperta] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(chiave) === "chiusa") setAperta(false);
    } catch {}
  }, [chiave]);

  return (
    <details
      className="sb-sezione"
      open={aperta}
      onToggle={(e) => {
        const o = e.currentTarget.open;
        if (o === aperta) return;
        setAperta(o);
        try {
          localStorage.setItem(chiave, o ? "aperta" : "chiusa");
        } catch {}
      }}
    >
      <summary className="sb-label">
        {titolo}
        <span className="sb-chevron">▾</span>
      </summary>
      {children}
    </details>
  );
}
