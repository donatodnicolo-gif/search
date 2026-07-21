"use client";

import { useRef, useState } from "react";
import { toggleInteresse } from "@/lib/azioni";
import { coloreInteresse, INTERESSI } from "@/lib/interessi";

// Tipologie di interesse in stile "Stato": pillole con dot colorato e menu a
// scelta multipla — ogni click aggiunge o toglie un interesse. Il menu resta
// aperto per selezionare più voci di fila; posizionato fixed per non essere
// ritagliato dallo scorrimento della tabella.
// `compatto` (righe di tabella): al massimo 2 pillole + "+N".
export function MenuInteressi({
  partnerId,
  interessi,
  compatto = false,
  linee,
}: {
  partnerId: string;
  interessi: string[];
  compatto?: boolean;
  linee?: string[];
}) {
  const ancora = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Catalogo selezionabile: linee live dal master se passate, altrimenti il
  // fallback statico. Gli attivi mostrano comunque tutti i valori memorizzati.
  const catalogo = linee && linee.length ? linee : [...INTERESSI];
  const attivi = interessi;

  return (
    <details
      className="menu-stato"
      onToggle={(e) => {
        if (e.currentTarget.open && ancora.current) {
          const r = ancora.current.getBoundingClientRect();
          // Rientra nel viewport: se aperto a sinistra sforerebbe a destra
          // (etichetta in alto a destra della scheda), lo si sposta a sinistra.
          const larghezza = 200;
          const left = Math.max(8, Math.min(r.left, window.innerWidth - larghezza - 8));
          setPos({ top: r.bottom + 6, left });
        }
      }}
    >
      <summary ref={(el) => { ancora.current = el; }}>
        {attivi.length === 0 ? (
          <span className="interessi-vuoto">—</span>
        ) : (
          <span className="interessi-pillole">
            {(compatto ? attivi.slice(0, 2) : attivi).map((i) => (
              <span className="pill-interesse" key={i} style={{ color: coloreInteresse(i) }}>
                <span className="dot" />
                <span className="stato-label">{i}</span>
              </span>
            ))}
            {compatto && attivi.length > 2 && (
              <span className="pill-interesse" title={attivi.slice(2).join(", ")}>
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
          {catalogo.map((i) => {
            const attivo = attivi.includes(i);
            return (
              <button
                key={i}
                type="submit"
                name="interesse"
                value={i}
                className="menu-stato-voce"
                style={{ color: coloreInteresse(i) }}
                title={attivo ? "Rimuovi" : "Aggiungi"}
              >
                <span className="dot" />
                <span className="stato-label">{i}</span>
                {attivo && <span className="interesse-spunta">✓</span>}
              </button>
            );
          })}
        </form>
      </div>
    </details>
  );
}
