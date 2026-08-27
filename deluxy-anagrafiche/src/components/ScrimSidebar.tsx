"use client";

import { useEffect } from "react";

// Velo dietro il drawer della sidebar su mobile (≤800px). Tap sul velo o Esc
// chiudono il drawer (Libro §2: chiusura al tap fuori). Su desktop il velo è
// display:none e non intercetta nulla. Chiudere = rimettere l'attributo
// data-sidebar-chiusa (drawer aperto = attributo assente). 27/08
function chiudi() {
  document.documentElement.setAttribute("data-sidebar-chiusa", "");
  try {
    localStorage.setItem("anagrafiche-sidebar", "chiusa");
  } catch {}
}

export function ScrimSidebar() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") chiudi();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return <div className="scrim-sidebar" aria-hidden onClick={chiudi} />;
}
