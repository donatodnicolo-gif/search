"use client";

import { useRef, useState } from "react";
import { cambiaStato, impostaArchiviato } from "@/lib/azioni";
import { BadgeStato } from "./BadgeStato";
import { COLORE_STATO, ETICHETTE_STATO, STATI } from "@/lib/stati";

// Badge di stato cliccabile nelle righe dell'elenco: si apre un menu con gli
// altri stati e un click esegue il passaggio (stessa server action della
// scheda). Il menu è posizionato "fixed" rispetto alla finestra, così non viene
// ritagliato dallo scorrimento orizzontale della tabella (.tabella-wrap).
// Sulle anagrafiche archiviate l'unica voce è "Ripristina".
export function MenuStato({
  partnerId,
  stato,
  archiviato = false,
}: {
  partnerId: string;
  stato: string;
  archiviato?: boolean;
}) {
  const ancora = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    // key: al cambio di stato/archivio il menu si smonta e si richiude da solo
    <details
      className="menu-stato"
      key={`${stato}-${archiviato}`}
      onToggle={(e) => {
        if (e.currentTarget.open && ancora.current) {
          const r = ancora.current.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: r.left });
        }
      }}
    >
      <summary ref={(el) => { ancora.current = el; }}>
        <BadgeStato stato={stato} />
        <span className="menu-freccia">▾</span>
      </summary>
      <div
        className="menu-stato-lista"
        style={pos ? { position: "fixed", top: pos.top, left: pos.left } : undefined}
      >
        {!archiviato && (
          <form action={cambiaStato.bind(null, partnerId)}>
            {STATI.filter((s) => s !== stato).map((s) => (
              <button
                key={s}
                type="submit"
                name="stato"
                value={s}
                className="menu-stato-voce"
                style={{ color: COLORE_STATO[s] }}
              >
                <span className="dot" />
                <span className="stato-label">{ETICHETTE_STATO[s]}</span>
              </button>
            ))}
          </form>
        )}
        {!archiviato && <div className="menu-divisore" />}
        <form action={impostaArchiviato.bind(null, partnerId, !archiviato)}>
          <button type="submit" className="menu-stato-voce menu-voce-archivio">
            {archiviato ? "↩ Ripristina" : "⌫ Archivia"}
          </button>
        </form>
      </div>
    </details>
  );
}
