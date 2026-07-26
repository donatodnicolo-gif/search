'use client'

// Mostra/nasconde il menu laterale: chiuso, gli ordini prendono tutta la
// larghezza. La scelta resta in localStorage e viene riapplicata prima del
// primo disegno (script nel <head>), così non si vede lampeggiare.
export function ToggleSidebar() {
  function alterna() {
    const root = document.documentElement
    const chiusa = root.hasAttribute('data-sidebar-chiusa')
    if (chiusa) {
      root.removeAttribute('data-sidebar-chiusa')
      try {
        localStorage.setItem('messaggi-sidebar', 'aperta')
      } catch {
        // localStorage negato: la scelta vale solo per questa pagina
      }
    } else {
      root.setAttribute('data-sidebar-chiusa', '')
      try {
        localStorage.setItem('messaggi-sidebar', 'chiusa')
      } catch {
        // idem
      }
    }
  }

  return (
    <button
      className="toggle-sidebar"
      onClick={alterna}
      aria-label="Mostra o nascondi il menu"
      title="Menu"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  )
}
