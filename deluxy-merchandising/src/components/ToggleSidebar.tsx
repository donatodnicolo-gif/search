"use client";

import { useEffect } from "react";

// Il bottone della barra laterale, che fa **due mestieri diversi** a seconda
// dello schermo — ed è la ragione per cui su telefono il menu non si apriva.
//
// - Da schermo grande la barra è aperta di default e il bottone la **chiude**:
//   la preferenza vive in localStorage e la riapplica lo script inline del
//   layout, prima del paint (niente lampeggio).
// - Da telefono la barra è un pannello a scomparsa, chiuso di default, e il
//   bottone lo **apre**. Qui la preferenza non si salva: un menu che si ritrova
//   aperto al caricamento copre la pagina che si voleva leggere.
//
// Due attributi distinti (`data-sidebar-chiusa`, `data-menu-aperto`) invece di
// uno solo: con un attributo unico il default dovrebbe essere insieme "aperto"
// e "chiuso" a seconda della larghezza, e uno dei due casi resterebbe sbagliato.

const SCHERMO_PICCOLO = "(max-width: 800px)";

function chiudiMenu() {
  document.documentElement.removeAttribute("data-menu-aperto");
}

export function ToggleSidebar() {
  useEffect(() => {
    // Toccata una voce, il pannello si chiude: restare aperto sopra la pagina
    // appena aperta vorrebbe dire richiuderlo a mano ogni volta.
    const suClic = (e: MouseEvent) => {
      const bersaglio = e.target as HTMLElement | null;
      if (bersaglio?.closest(".sidebar a")) chiudiMenu();
    };
    // Tornando a schermo grande il pannello non ha più ragione di esistere.
    const mq = window.matchMedia(SCHERMO_PICCOLO);
    const suCambio = () => {
      if (!mq.matches) chiudiMenu();
    };
    document.addEventListener("click", suClic);
    mq.addEventListener("change", suCambio);
    return () => {
      document.removeEventListener("click", suClic);
      mq.removeEventListener("change", suCambio);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="toggle-sidebar"
        title="Mostra o nascondi la barra laterale"
        aria-label="Mostra o nascondi la barra laterale"
        onClick={() => {
          const html = document.documentElement;
          if (window.matchMedia(SCHERMO_PICCOLO).matches) {
            html.toggleAttribute("data-menu-aperto");
            return;
          }
          const chiusa = html.toggleAttribute("data-sidebar-chiusa");
          try {
            localStorage.setItem("merchandising-sidebar", chiusa ? "chiusa" : "aperta");
          } catch {}
        }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {/* Il velo dietro il pannello: toccandolo si torna al contenuto, che è il
          gesto che si prova prima di cercare di nuovo il bottone. */}
      <button type="button" className="velo-menu" aria-label="Chiudi il menu" tabIndex={-1} onClick={chiudiMenu} />
    </>
  );
}
