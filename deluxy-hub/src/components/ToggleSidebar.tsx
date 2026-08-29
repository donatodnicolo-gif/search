"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Mostra/nasconde il menu laterale, come in tutte le app Deluxy.
// - DESKTOP: collassa/espande la colonna (preferenza in localStorage,
//   riapplicata prima del paint dallo script nel <head>, così non lampeggia).
// - TELEFONO (≤800px): apre/chiude un cassetto che scivola da SINISTRA
//   (`data-menu-aperto` su <html>), col velo dietro. La colonna a 240px non ci
//   sta in riga.
function suTelefono(): boolean {
  try {
    return window.matchMedia("(max-width: 800px)").matches;
  } catch {
    return false;
  }
}

export function ToggleSidebar() {
  const pathname = usePathname();

  // Cambiando pagina il cassetto mobile si chiude da sé.
  useEffect(() => {
    document.documentElement.removeAttribute("data-menu-aperto");
  }, [pathname]);

  // Esc chiude il cassetto.
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
      try { localStorage.setItem("hub-sidebar", "aperta"); } catch {}
    } else {
      root.setAttribute("data-sidebar-chiusa", "");
      try { localStorage.setItem("hub-sidebar", "chiusa"); } catch {}
    }
  }

  return (
    <>
      <button className="toggle-sidebar" onClick={toggle} aria-label="Mostra o nascondi il menu" title="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {/* Il velo dietro il cassetto mobile: un tocco fuori chiude il menu. */}
      <div className="menu-backdrop" onClick={() => document.documentElement.removeAttribute("data-menu-aperto")} aria-hidden="true" />
    </>
  );
}
