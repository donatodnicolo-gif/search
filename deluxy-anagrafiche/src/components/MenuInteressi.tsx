"use client";

import { useRef, useState } from "react";
import { toggleInteresse } from "@/lib/azioni";
import { COLORE_INTERESSE, ETICHETTE_INTERESSE, INTERESSI, isInteresse } from "@/lib/interessi";

// Tipologie di interesse in stile "Stato": pillole con dot colorato e menu a
// scelta multipla — ogni click aggiunge o toglie un interesse. Il menu resta
// aperto per selezionare più voci di fila; posizionato fixed per non essere
// ritagliato dallo scorrimento della tabella.
// `compatto` (righe di tabella): al massimo 2 pillole + "+N".
export function MenuInteressi({
  partnerId,
  interessi,
  compatto = false,
}: {
  partnerId: string;
  interessi: string[];
  compatto?: boolean;
}) {
  const ancora = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const attivi = interessi.filter(isInteresse);

  return (
    <details
      className="menu-stato"
      onToggle={(e) => {
        if (e.currentTarget.open && ancora.current) {
          const r = ancora.current.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: r.left });
        }
      }}
    >
      <summary ref={(el) => { ancora.current = el; }}>
        {attivi.length === 0 ? (
          <span className="interessi-vuoto">—</span>
        ) : (
          <span className="interessi-pillole">
            {(compatto ? attivi.slice(0, 2) : attivi).map((i) => (
              <span className="pill-interesse" key={i} style={{ color: COLORE_INTERESSE[i] }}>
                <span className="dot" />
                <span className="stato-label">{ETICHETTE_INTERESSE[i]}</span>
              </span>
            ))}
            {compatto && attivi.length > 2 && (
              <span className="pill-interesse" title={attivi.slice(2).map((i) => ETICHETTE_INTERESSE[i]).join(", ")}>
                <span className="stato-label">+{attivi.length - 2}</span>
              </span>
            )}
          </span>
        )}
        <span className="menu-freccia">▾</span>
      </summary>
      <div
        className="menu-stato-lista"
        style={pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
      >
        <form action={toggleInteresse.bind(null, partnerId)}>
          {INTERESSI.map((i) => {
            const attivo = attivi.includes(i);
            return (
              <button
                key={i}
                type="submit"
                name="interesse"
                value={i}
                className="menu-stato-voce"
                style={{ color: COLORE_INTERESSE[i] }}
                title={attivo ? "Rimuovi" : "Aggiungi"}
              >
                <span className="dot" />
                <span className="stato-label">{ETICHETTE_INTERESSE[i]}</span>
                {attivo && <span className="interesse-spunta">✓</span>}
              </button>
            );
          })}
        </form>
      </div>
    </details>
  );
}
