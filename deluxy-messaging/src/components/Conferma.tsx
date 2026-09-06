'use client'

import { useEffect, useRef } from 'react'

// LA CONFERMA NARRATIVA, in una finestra del nostro stile.
//
// ⚠️ Libro UX&UI §7: `window.confirm()` è vietato nel codice nuovo — la
// finestra del browser non ha il nostro carattere, non si legge sul telefono e
// dice «localhost:3140 dice». Chiesto dall'utente il 06/09/2026 davanti al
// confirm del passo «In App»: «dammi pop-up in linea con nostro css».
//
// Il canone: il NOME dell'oggetto nel titolo, le CONSEGUENZE nel testo, il
// bottone col VERBO. Qui non è una distruzione, quindi il primario è nero (il
// rosso resta alle conferme distruttive). Esc e il clic sul velo valgono
// «Annulla»; il fuoco parte sul bottone primario, così Invio conferma.
export function Conferma({
  titolo,
  children,
  verbo,
  annulla = 'Annulla',
  pericoloso = false,
  onConferma,
  onAnnulla,
}: {
  titolo: string
  /** Le conseguenze, scritte: cosa succede con il sì e cosa con il no. */
  children: React.ReactNode
  /** L'etichetta del bottone primario: un verbo («Apri il modulo»), mai «OK». */
  verbo: string
  annulla?: string
  /** Vero per le conferme distruttive: il primario diventa rosso. */
  pericoloso?: boolean
  onConferma: () => void
  onAnnulla: () => void
}) {
  const primario = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primario.current?.focus()
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnnulla()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onAnnulla])

  return (
    <div
      className="velo-conferma"
      onClick={(e) => {
        // ⚠️ Il clic sul velo vale «Annulla» e si FERMA qui: sotto può esserci il
        // pannello dell'ordine, che chiude al clic sul suo velo — senza questo,
        // annullare la domanda chiudeva anche la scheda.
        e.stopPropagation()
        onAnnulla()
      }}
    >
      <div
        className="finestra-conferma"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conferma-titolo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="conferma-titolo">{titolo}</h2>
        <div className="conferma-testo">{children}</div>
        <div className="conferma-azioni">
          <button
            ref={primario}
            type="button"
            className={pericoloso ? 'btn danger' : 'btn'}
            onClick={onConferma}
          >
            {verbo}
          </button>
          <button type="button" className="btn btn-secondario" onClick={onAnnulla}>
            {annulla}
          </button>
        </div>
      </div>
    </div>
  )
}
