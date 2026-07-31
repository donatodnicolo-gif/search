"use client";

import { useEffect } from "react";

// Il pulsante ☰ fa due lavori diversi a seconda dello schermo.
//
// Su desktop nasconde e rimostra la sidebar, e la scelta si ricorda
// (localStorage, riapplicata prima del paint da uno script nel <head> così non
// lampeggia).
//
// Su telefono la sidebar è un cassetto che entra da sinistra, e la scelta NON
// si ricorda: un menu che si ritrova aperto al caricamento successivo coprirebbe
// la pagina senza motivo. Si chiude toccando lo sfondo, scegliendo una voce o
// premendo Esc.
const STRETTO = "(max-width: 800px)";

export function ToggleSidebar() {
  useEffect(() => {
    const root = document.documentElement;
    const chiudi = () => root.removeAttribute("data-menu-aperto");

    // Una voce scelta porta a un'altra pagina: il cassetto deve togliersi di
    // mezzo da solo. Next naviga senza ricaricare, quindi l'attributo
    // resterebbe lì e coprirebbe la pagina appena aperta.
    const suClic = (e: MouseEvent) => {
      const bersaglio = e.target as HTMLElement | null;
      if (bersaglio?.closest(".sidebar a")) chiudi();
    };
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") chiudi();
    };
    // Tornando a schermo largo la sidebar è di nuovo fissa: l'attributo del
    // cassetto non deve restare acceso in silenzio.
    const largo = window.matchMedia(STRETTO);
    const suMisura = () => {
      if (!largo.matches) chiudi();
    };

    document.addEventListener("click", suClic);
    document.addEventListener("keydown", suTasto);
    largo.addEventListener("change", suMisura);
    return () => {
      document.removeEventListener("click", suClic);
      document.removeEventListener("keydown", suTasto);
      largo.removeEventListener("change", suMisura);
    };
  }, []);

  function tocca() {
    const root = document.documentElement;

    if (window.matchMedia(STRETTO).matches) {
      root.toggleAttribute("data-menu-aperto");
      return;
    }

    const chiusa = root.hasAttribute("data-sidebar-chiusa");
    if (chiusa) {
      root.removeAttribute("data-sidebar-chiusa");
      try { localStorage.setItem("trx-sidebar", "aperta"); } catch {}
    } else {
      root.setAttribute("data-sidebar-chiusa", "");
      try { localStorage.setItem("trx-sidebar", "chiusa"); } catch {}
    }
  }

  return (
    <>
      <button className="toggle-sidebar" onClick={tocca} aria-label="Mostra/nascondi menu" title="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {/* Vive fuori dal flusso (position: fixed), quindi qui dentro la barra
          superiore sta bene: si vede solo su schermo stretto e a menu aperto. */}
      <div
        className="sfondo-menu"
        onClick={() => document.documentElement.removeAttribute("data-menu-aperto")}
        aria-hidden="true"
      />
    </>
  );
}
