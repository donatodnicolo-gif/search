'use client'

import { useState } from 'react'

// Una cella che si copia toccando il testo. Desktop e telefono.
//
// ⚠️ Il caso vero è questo: un IBAN di ventisette caratteri va incollato nel
// portale della banca. Selezionarlo col dito su un telefono — trascinare le due
// maniglie dentro una tabella che scorre di lato — non riesce quasi mai, e chi
// ci prova finisce per ribatterlo a mano. Un tocco solo è l'unica interazione
// che funziona davvero lì.

export function CellaCopiabile({
  testo,
  mostrato,
  className,
  titolo,
  monospazio,
}: {
  /** Quello che finisce negli appunti. */
  testo: string
  /** Quello che si legge, se diverso (un importo formattato, una data). */
  mostrato?: React.ReactNode
  className?: string
  titolo?: string
  monospazio?: boolean
}) {
  const [copiato, setCopiato] = useState(false)
  const [errore, setErrore] = useState(false)

  /** Il ripiego di sempre: una casella fuori schermo, selezionata e copiata. */
  function copiaVecchiaManiera(v: string): boolean {
    try {
      const a = document.createElement('textarea')
      a.value = v
      // ⚠️ Fuori dallo schermo ma NON `display:none`: un elemento nascosto
      // davvero non si può selezionare, e la copia non parte.
      a.style.position = 'fixed'
      a.style.top = '0'
      a.style.opacity = '0'
      a.style.pointerEvents = 'none'
      a.setAttribute('readonly', '')
      document.body.appendChild(a)
      a.focus()
      a.select()
      // ⚠️ Su iOS `select()` non basta: vuole l'intervallo esplicito.
      a.setSelectionRange(0, v.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(a)
      return ok
    } catch {
      return false
    }
  }

  async function copia() {
    const v = (testo ?? '').trim()
    if (!v) return

    // ⚠️⚠️ SI PROVA, E SE FALLISCE SI RIPROVA IN UN ALTRO MODO — non ci si
    // arrende al primo no.
    //
    // `navigator.clipboard` vuole un contesto sicuro E che la pagina abbia il
    // fuoco: rifiuta con `NotAllowedError` se la finestra non è quella attiva,
    // e Safari lo rifiuta in altri casi ancora. Misurato: con la scheda non a
    // fuoco falliva, e senza ripiego l'utente vedeva «selezionalo a mano» su
    // una copia che si poteva benissimo fare. Il vecchio `execCommand` è
    // deprecato ma funziona ovunque, ed è esattamente ciò che serve a un
    // ripiego.
    let fatto = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(v)
        fatto = true
      }
    } catch {
      fatto = false
    }
    if (!fatto) fatto = copiaVecchiaManiera(v)

    if (fatto) {
      setCopiato(true)
      setErrore(false)
      setTimeout(() => setCopiato(false), 1400)
      return
    }
    // ⚠️ Se davvero non si può copiare lo si DICE. Un tocco che non fa niente
    // si ripete tre volte e poi si smette di usare: meglio sapere che quella
    // volta va selezionato a mano.
    setErrore(true)
    setTimeout(() => setErrore(false), 2500)
  }

  return (
    <td className={className}>
      <button
        type="button"
        className={`cella-copia${monospazio ? ' mono' : ''}${copiato ? ' copiato' : ''}`}
        onClick={() => void copia()}
        title={titolo ?? (testo ? `Tocca per copiare: ${testo}` : undefined)}
        aria-label={testo ? `Copia ${testo}` : undefined}
        disabled={!testo?.trim()}
      >
        {mostrato ?? testo ?? '—'}
        {copiato ? <span className="segno-copiato"> copiato ✓</span> : null}
        {errore ? <span className="segno-copiato errore"> selezionalo a mano</span> : null}
      </button>
    </td>
  )
}
