'use client'

import { apriAzioneRapida, type TipoAzione } from './AzioneRapida'

/**
 * Il «+» accanto a un'applicazione nella sidebar: apre il popup dell'azione
 * rapida senza cambiare pagina. Solo desktop (su mobile la sidebar è un
 * cassetto: si apre l'app e basta).
 */
export function PiuAzione({ tipo, titolo }: { tipo: TipoAzione; titolo: string }) {
  return (
    <button
      type="button"
      className="nav-piu"
      title={titolo}
      aria-label={titolo}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        apriAzioneRapida(tipo)
      }}
    >
      +
    </button>
  )
}
