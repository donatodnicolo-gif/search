'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * La struttura pagina: sidebar + contenuto. Su desktop la sidebar è fissa; su
 * mobile diventa un cassetto a scomparsa, aperto dall'hamburger e richiuso
 * automaticamente quando si cambia pagina o si tocca lo sfondo.
 *
 * La sidebar (server component) arriva come prop, così restiamo un guscio
 * client leggero attorno a lei.
 */
export function Shell({
  sidebar,
  mostraNav,
  children,
}: {
  sidebar: React.ReactNode
  mostraNav: boolean
  children: React.ReactNode
}) {
  const [aperto, setAperto] = useState(false)
  const path = usePathname()

  // Cambiando pagina il cassetto si chiude (la navigazione client non rimonta
  // il layout, quindi va chiuso a mano).
  useEffect(() => {
    setAperto(false)
  }, [path])

  // Niente scroll del corpo mentre il cassetto è aperto.
  useEffect(() => {
    if (aperto) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [aperto])

  if (!mostraNav) {
    // Login o utente non autenticato: nessuna barra, contenuto a tutta pagina.
    return (
      <div className="shell">
        <main className="main">{children}</main>
      </div>
    )
  }

  return (
    <>
      <header className="mobile-bar">
        <button
          type="button"
          className="hamburger"
          aria-label={aperto ? 'Chiudi menu' : 'Apri menu'}
          aria-expanded={aperto}
          onClick={() => setAperto((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="mobile-title">AI Mail</span>
      </header>

      <div className={`shell ${aperto ? 'nav-open' : ''}`}>
        {sidebar}
        <main className="main">{children}</main>
      </div>

      {aperto && <div className="nav-scrim" onClick={() => setAperto(false)} aria-hidden />}
    </>
  )
}
