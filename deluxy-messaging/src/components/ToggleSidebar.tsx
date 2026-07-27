'use client'

import { useEffect, useState } from 'react'

// Il tasto del menu. Fa due cose diverse a seconda dello schermo, e non è una
// furbizia: su un desktop il menu è una colonna che si può restringere per dare
// spazio agli ordini, su un telefono è un pannello che copre la pagina e che
// deve sparire appena hai scelto dove andare.
//
//  - Da desktop alterna `data-sidebar-chiusa` sull'html, e la scelta RESTA
//    (localStorage): chi lavora col menu chiuso lo ritrova chiuso domani.
//  - Da mobile alterna `data-menu-aperto`, e la scelta NON resta: un pannello
//    che copre lo schermo e si ritrova aperto alla visita dopo è una porta
//    lasciata aperta, non una preferenza.

const MOBILE = '(max-width: 800px)'

/** Vero se siamo sotto la soglia mobile. Fuori dal browser: falso. */
function suMobile() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE).matches
}

export function ToggleSidebar() {
  const [aperto, setAperto] = useState(false)

  // Passando da telefono a desktop (rotazione, finestra allargata) il pannello
  // resterebbe "aperto" mentre il menu è già tornato colonna fissa: uno stato
  // fantasma che continua a bloccare lo scorrimento della pagina.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE)
    const suCambio = () => {
      if (!mq.matches) {
        document.documentElement.removeAttribute('data-menu-aperto')
        setAperto(false)
      }
    }
    mq.addEventListener('change', suCambio)
    return () => mq.removeEventListener('change', suCambio)
  }, [])

  // Esc chiude, come ci si aspetta da qualunque pannello sovrapposto.
  useEffect(() => {
    if (!aperto) return
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') document.documentElement.removeAttribute('data-menu-aperto')
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [aperto])

  // Il pannello si chiude anche da fuori: dal velo, e da solo quando si cambia
  // pagina. Il bottone deve accorgersene, altrimenti `aria-expanded` racconta
  // una bugia a chi usa un lettore di schermo.
  useEffect(() => {
    const root = document.documentElement
    const osserva = new MutationObserver(() =>
      setAperto(root.hasAttribute('data-menu-aperto'))
    )
    osserva.observe(root, { attributes: true, attributeFilter: ['data-menu-aperto'] })
    return () => osserva.disconnect()
  }, [])

  function alterna() {
    const root = document.documentElement

    if (suMobile()) {
      if (root.hasAttribute('data-menu-aperto')) root.removeAttribute('data-menu-aperto')
      else root.setAttribute('data-menu-aperto', '')
      return // lo stato lo aggiorna l'osservatore qui sopra: una sola verità
    }

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
      aria-label={aperto ? 'Chiudi il menu' : 'Apri il menu'}
      aria-expanded={aperto}
      aria-controls="menu-laterale"
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

/**
 * Il velo dietro al pannello: scurisce la pagina e la chiude se lo tocchi.
 *
 * È un `button` e non un `div`: su un telefono ci si tocca sopra per chiudere,
 * ed è la stessa cosa che devono poter fare tastiera e lettori di schermo. Un
 * div con onClick non la offre a nessuno dei due.
 */
export function VeloMenu() {
  return (
    <button
      type="button"
      className="velo-menu"
      aria-label="Chiudi il menu"
      onClick={() => document.documentElement.removeAttribute('data-menu-aperto')}
    />
  )
}
