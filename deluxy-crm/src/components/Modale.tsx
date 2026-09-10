"use client";

import { useEffect, useRef, useState } from "react";

// Una finestra modale a norma Libro UX §9: sta DENTRO la viewport (tetto
// 92dvh), scorre il contenuto e non la pagina, testata fissa con la ✕
// obbligatoria, si chiude con Esc e col clic sul velo. Si apre da un bottone
// che porta il suo testo; il contenuto è reso dal server (children).
export default function Modale({
  bottone,
  titolo,
  sotto,
  className = "btn ghost",
  children,
}: {
  bottone: React.ReactNode;
  titolo: string;
  sotto?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aperta, setAperta] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aperta && !d.open) d.showModal();
    if (!aperta && d.open) d.close();
  }, [aperta]);

  return (
    <>
      <button type="button" className={className} onClick={() => setAperta(true)}>
        {bottone}
      </button>
      <dialog
        ref={ref}
        className="modale"
        onClose={() => setAperta(false)}
        onClick={(e) => {
          // Clic sul velo (fuori dal pannello) = chiudi.
          if (e.target === ref.current) setAperta(false);
        }}
      >
        <div className="modale-pannello">
          <div className="modale-testata">
            <div>
              <div className="card-titolo" style={{ marginBottom: 2 }}>{titolo}</div>
              {sotto ? <div className="card-sub" style={{ marginBottom: 0 }}>{sotto}</div> : null}
            </div>
            <button type="button" className="modale-chiudi" aria-label="Chiudi" onClick={() => setAperta(false)}>
              ✕
            </button>
          </div>
          <div className="modale-corpo">{aperta ? children : null}</div>
        </div>
      </dialog>
    </>
  );
}
