"use client";

// Bottone nella topbar che apre/chiude la sidebar. La preferenza vive in
// localStorage e viene riapplicata prima del paint dallo script inline nel
// layout (niente lampeggio al caricamento).
export function ToggleSidebar() {
  return (
    <button
      type="button"
      className="toggle-sidebar"
      title="Mostra o nascondi la barra laterale"
      aria-label="Mostra o nascondi la barra laterale"
      onClick={() => {
        const chiusa = document.documentElement.toggleAttribute("data-sidebar-chiusa");
        try {
          localStorage.setItem("anagrafiche-sidebar", chiusa ? "chiusa" : "aperta");
        } catch {}
      }}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <path
          d="M4 6.5h16M4 12h16M4 17.5h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
