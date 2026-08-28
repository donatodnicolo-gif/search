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

const MEDIA_MOBILE = "(max-width: 800px)";

function focusabili(): HTMLElement[] {
  const sb = document.querySelector<HTMLElement>(".sidebar");
  if (!sb) return [];
  return Array.from(
    sb.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function ScrimSidebar() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") chiudi();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Focus-trap del drawer su mobile (Libro §2): quando il drawer si apre il
  // focus entra nella sidebar e Tab cicla solo lì dentro; alla chiusura il
  // focus torna a chi l'aveva (il bottone hamburger). Su desktop la sidebar
  // è un pannello persistente e non si intrappola niente.
  useEffect(() => {
    let restituisci: HTMLElement | null = null;

    function onTrap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusabili();
      if (!els.length) return;
      const primo = els[0];
      const ultimo = els[els.length - 1];
      const attivo = document.activeElement as HTMLElement | null;
      const dentro = attivo ? els.includes(attivo) : false;
      if (e.shiftKey) {
        if (!dentro || attivo === primo) {
          e.preventDefault();
          ultimo.focus();
        }
      } else if (!dentro || attivo === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    }

    const mo = new MutationObserver(() => {
      const aperto = !document.documentElement.hasAttribute("data-sidebar-chiusa");
      if (aperto && window.matchMedia(MEDIA_MOBILE).matches) {
        restituisci = (document.activeElement as HTMLElement) ?? null;
        document.addEventListener("keydown", onTrap, true);
        focusabili()[0]?.focus();
      } else {
        document.removeEventListener("keydown", onTrap, true);
        if (restituisci) {
          restituisci.focus();
          restituisci = null;
        }
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar-chiusa"] });
    return () => {
      mo.disconnect();
      document.removeEventListener("keydown", onTrap, true);
    };
  }, []);

  return <div className="scrim-sidebar" aria-hidden onClick={chiudi} />;
}
