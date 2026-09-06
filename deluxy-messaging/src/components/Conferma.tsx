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
// rosso resta alle conferme distruttive). Il fuoco parte sul bottone primario,
// così Invio conferma.
//
// ⚠️ TRE uscite, non due (utente, 06/09/2026: «manca la x di chiusura»; Libro
// v1.7 §9: la ✕ è obbligatoria). Il bottone «Annulla» qui può essere
// un'AZIONE («No, segna solo lo stato» fa qualcosa); la ✕, Esc e il clic sul
// velo sono invece «lascia stare»: si chiude e non succede niente. Se chi usa
// il componente non distingue, `onChiudi` ricade su `onAnnulla`.
export function Conferma({
  titolo,
  children,
  verbo,
  annulla = 'Annulla',
  pericoloso = false,
  onConferma,
  onAnnulla,
  onChiudi,
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
  /** Il bottone secondario: può essere un'azione, non solo «lascia stare». */
  onAnnulla: () => void
  /** La ✕, Esc e il clic sul velo: chiudere senza fare niente. Se manca, vale `onAnnulla`. */
  onChiudi?: () => void
}) {
  const primario = useRef<HTMLButtonElement>(null)
  const chiudi = onChiudi ?? onAnnulla

  useEffect(() => {
    primario.current?.focus()
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') chiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [chiudi])

  return (
    <div
      className="velo-conferma"
      onClick={(e) => {
        // ⚠️ Il clic sul velo vale «Annulla» e si FERMA qui: sotto può esserci il
        // pannello dell'ordine, che chiude al clic sul suo velo — senza questo,
        // annullare la domanda chiudeva anche la scheda.
        e.stopPropagation()
        chiudi()
      }}
    >
      <div
        className="finestra-conferma"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conferma-titolo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="conferma-testa">
          <h2 id="conferma-titolo">{titolo}</h2>
          <button
            type="button"
            className="pannello-chiudi"
            aria-label="Chiudi senza fare niente"
            title="Chiudi senza fare niente (Esc)"
            onClick={chiudi}
          >
            ✕
          </button>
        </div>
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
