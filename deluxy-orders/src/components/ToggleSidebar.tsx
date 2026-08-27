"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Mostra/nasconde la navigazione.
// - Su DESKTOP: collassa/espande la colonna (preferenza in localStorage,
//   riapplicata prima del paint dallo script nel <head>, così non lampeggia).
// - Su TELEFONO (≤800px): apre/chiude un CASSETTO a scomparsa sopra il
//   contenuto (`data-menu-aperto`), perché la colonna a 240px non ci sta in
//   riga. Prima la sidebar era semplicemente nascosta e da telefono non c'era
//   modo di navigare (revisione UX 27/08).
function suTelefono(): boolean {
  try {
    return window.matchMedia("(max-width: 800px)").matches;
  } catch {
    return false;
  }
}

export function ToggleSidebar() {
  const pathname = usePathname();

  // Cambiando pagina il cassetto mobile si chiude da sé: navigare da una voce
  // del menu porta alla pagina E chiude il menu, come ci si aspetta.
  useEffect(() => {
    document.documentElement.removeAttribute("data-menu-aperto");
  }, [pathname]);

  // Esc chiude il cassetto (e non fa niente se è già chiuso).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") document.documentElement.removeAttribute("data-menu-aperto");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggle() {
    const root = document.documentElement;
    if (suTelefono()) {
      if (root.hasAttribute("data-menu-aperto")) root.removeAttribute("data-menu-aperto");
      else root.setAttribute("data-menu-aperto", "");
      return;
    }
    const chiusa = root.hasAttribute("data-sidebar-chiusa");
    if (chiusa) {
      root.removeAttribute("data-sidebar-chiusa");
      try { localStorage.setItem("orders-sidebar", "aperta"); } catch {}
    } else {
      root.setAttribute("data-sidebar-chiusa", "");
      try { localStorage.setItem("orders-sidebar", "chiusa"); } catch {}
    }
  }

  function chiudiMenu() {
    document.documentElement.removeAttribute("data-menu-aperto");
  }

  return (
    <>
      <button className="toggle-sidebar" onClick={toggle} aria-label="Mostra/nascondi menu" title="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {/* Il velo dietro il cassetto mobile: un tocco fuori chiude il menu. */}
      <div className="menu-backdrop" onClick={chiudiMenu} aria-hidden="true" />
    </>
  );
}
