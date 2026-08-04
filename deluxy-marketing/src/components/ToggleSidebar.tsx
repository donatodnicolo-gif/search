"use client";

import { useEffect, useState } from "react";

// Bottone nella topbar che apre/chiude la barra laterale.
//
// Fa DUE cose diverse a seconda della larghezza, perché il punto di partenza è
// diverso: su schermo grande la sidebar è aperta e il bottone la chiude (la
// preferenza vive in localStorage e viene riapplicata prima del paint dallo
// script inline nel layout, niente lampeggio); su telefono la sidebar è un
// cassetto chiuso sopra la pagina e il bottone lo apre.
//
// ⚠️ Lo stato del telefono NON si salva. Un cassetto che copre il contenuto
// non deve ritrovarsi aperto alla riapertura dell'app: lì la memoria sarebbe
// un fastidio, non una comodità.
const MOBILE = "(max-width: 800px)";

export function ToggleSidebar() {
  const [apertaMobile, setApertaMobile] = useState(false);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-sidebar-mobile", apertaMobile);
  }, [apertaMobile]);

  useEffect(() => {
    // Il cassetto si chiude da solo appena si sceglie dove andare: altrimenti
    // resta aperto sopra la pagina appena caricata (la navigazione di Next è
    // lato client, l'attributo sull'<html> sopravvive al cambio pagina).
    const suClic = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest(".sidebar a")) setApertaMobile(false);
    };
    const suEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setApertaMobile(false);
    };
    // Tornando a schermo largo il cassetto non ha più senso: si spegne, o
    // resterebbe l'overflow bloccato sull'<html>.
    const media = window.matchMedia(MOBILE);
    const suMedia = () => {
      if (!media.matches) setApertaMobile(false);
    };
    document.addEventListener("click", suClic);
    document.addEventListener("keydown", suEsc);
    media.addEventListener("change", suMedia);
    return () => {
      document.removeEventListener("click", suClic);
      document.removeEventListener("keydown", suEsc);
      media.removeEventListener("change", suMedia);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="toggle-sidebar"
        title="Mostra o nascondi la barra laterale"
        aria-label="Mostra o nascondi la barra laterale"
        aria-expanded={apertaMobile || undefined}
        onClick={() => {
          if (window.matchMedia(MOBILE).matches) {
            setApertaMobile((a) => !a);
            return;
          }
          const chiusa = document.documentElement.toggleAttribute("data-sidebar-chiusa");
          try {
            localStorage.setItem("marketing-sidebar", chiusa ? "chiusa" : "aperta");
          } catch {}
        }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="velo-sidebar"
        aria-label="Chiudi il menu"
        tabIndex={apertaMobile ? 0 : -1}
        onClick={() => setApertaMobile(false)}
      />
    </>
  );
}
