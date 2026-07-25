"use client";

// Mostra/nasconde la sidebar. La preferenza è in localStorage e viene riapplicata
// prima del paint (script nel <head>), così non lampeggia al caricamento.
export function ToggleSidebar() {
  function toggle() {
    const root = document.documentElement;
    const chiusa = root.hasAttribute("data-sidebar-chiusa");
    if (chiusa) {
      root.removeAttribute("data-sidebar-chiusa");
      try { localStorage.setItem("orders-sidebar", "aperta"); } catch {}
    } else {
      root.setAttribute("data-sidebar-chiusa", "");
      try { localStorage.setItem("orders-sidebar", "chiusa"); } catch {}
    }
  }
  return (
    <button className="toggle-sidebar" onClick={toggle} aria-label="Mostra/nascondi menu" title="Menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
