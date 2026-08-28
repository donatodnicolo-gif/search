"use client";

import { type ReactNode, useState } from "react";

// Zona filtri col collasso mobile (Libro UX&UI v1.2 §8): sotto la soglia i
// campi stanno dietro «Filtri (N)»; dalla soglia in su sono sempre visibili e
// il bottone non c'è (via CSS). Il conteggio N arriva dal server (searchParams
// attivi), così anche a pannello chiuso si sa perché la lista è ridotta.
// Sostituisce il checkbox-hack di M7 (vietato dal Libro §8.8: fallisce
// tastiera e screen reader) con una disclosure accessibile aria-expanded.
// I campi restano SEMPRE montati (solo display:none): in un form GET i campi
// nascosti via CSS vengono comunque inviati, quindi il submit non perde i
// filtri attivi.
export function ZonaFiltri({ attivi = 0, children }: { attivi?: number; children: ReactNode }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="zona-filtri" data-aperto={aperto ? "" : undefined}>
      <button type="button" className="zf-bottone" aria-expanded={aperto} onClick={() => setAperto((v) => !v)}>
        Filtri{attivi > 0 ? ` (${attivi})` : ""}
      </button>
      <div className="zf-campi">{children}</div>
    </div>
  );
}
