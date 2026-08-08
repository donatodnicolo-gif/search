'use client'

import { useEffect } from 'react'

/**
 * La ✕ per chiudere un dialogo, in cima a destra.
 *
 * ⚠️ Il tasto «Chiudi» in fondo c'era già, ma in un dialogo che **scorre** (la
 * ricerca delle mail da agganciare ne mostra decine) resta sotto la piega: chi
 * guarda vede una finestra senza uscita. Segnalato il 7/08/2026. Anche il clic
 * fuori chiudeva, ma è una cosa che si sa solo se la si prova — e provarla, su
 * una finestra che sembra senza uscita, non è naturale.
 *
 * Si usa dentro `.modal-title`, che è una riga flex: titolo a sinistra, ✕ a
 * destra, e resta **appiccicata in cima** mentre la lista scorre.
 */
export function ChiudiModale({ onChiudi }: { onChiudi: () => void }) {
  return (
    <button type="button" className="modal-chiudi" onClick={onChiudi} title="Chiudi (Esc)" aria-label="Chiudi">
      ✕
    </button>
  )
}

/** `Esc` chiude il dialogo: è quello che tutti provano per primo. */
export function useChiudiConEsc(attivo: boolean, onChiudi: () => void) {
  useEffect(() => {
    if (!attivo) return
    const su = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onChiudi()
      }
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [attivo, onChiudi])
}
