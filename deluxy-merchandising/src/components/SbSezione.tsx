"use client";

import { useEffect, useState } from "react";

/**
 * Sezione della sidebar apribile/chiudibile dal click sull'etichetta.
 *
 * `chiusa` è lo stato di **partenza**: le sezioni secondarie (le lenti sul
 * catalogo) nascono ripiegate, così il menu di default mostra solo il lavoro
 * di tutti i giorni. La scelta dell'utente, una volta fatta, vince sempre:
 * si ricorda in localStorage per titolo.
 */
export function SbSezione({
  titolo,
  chiusa = false,
  children,
}: {
  titolo: string;
  chiusa?: boolean;
  children: React.ReactNode;
}) {
  const chiave = `merchandising-sezione-${titolo}`;
  const [aperta, setAperta] = useState(!chiusa);

  useEffect(() => {
    try {
      const salvata = localStorage.getItem(chiave);
      if (salvata === "chiusa") setAperta(false);
      if (salvata === "aperta") setAperta(true);
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
