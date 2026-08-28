'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rende una finestra SPOSTABILE trascinandola per il suo titolo.
 *
 * ⚠️ PERCHÉ ESISTE. Le finestre di quest'app chiedono di compilare dei campi
 * leggendo la mail che c'è sotto — «Registra contatto» vuole partita IVA, PEC,
 * codice destinatario, e quei dati stanno nel piè di pagina del messaggio, cioè
 * esattamente dove la finestra si è appoggiata. Finché non si poteva spostare,
 * l'unico modo era chiuderla, leggere, riaprirla e ricominciare
 * (segnalato il 27/08/2026).
 *
 * ⚠️ NON su telefono: là la finestra sale dal fondo e occupa tutto lo schermo,
 * non c'è nessun «altrove» dove spostarla, e il trascinamento ruberebbe lo
 * scorrimento al dito.
 *
 * ⚠️ Lo spostamento NON si conserva: riaprendo, la finestra torna al suo posto.
 * Una finestra che ricompare dove l'avevi lasciata tre giorni fa — magari fuori
 * schermo, se nel frattempo hai cambiato monitor — è peggio di una che non si
 * sposta.
 */
export function useSpostabile(aperta: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  /** Da dove è partito il trascinamento, e dov'era la finestra a riposo. */
  const preso = useRef<{
    px: number
    py: number
    x0: number
    y0: number
    left0: number
    top0: number
    w: number
    h: number
  } | null>(null)

  // Chiudendo si dimentica: vedi il commento in cima.
  useEffect(() => {
    if (!aperta) {
      preso.current = null
      setPos({ x: 0, y: 0 })
    }
  }, [aperta])

  const inizia = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      // ⚠️ Non si trascina partendo da un comando: la ✕ del titolo deve
      // restare un bottone, non una maniglia.
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches) return
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      preso.current = {
        px: e.clientX,
        py: e.clientY,
        x0: pos.x,
        y0: pos.y,
        // Dov'è la finestra QUANDO NON È SPOSTATA: serve a calcolare i limiti
        // una volta sola, invece di inseguirli mentre si muove.
        left0: r.left - pos.x,
        top0: r.top - pos.y,
        w: r.width,
        h: r.height,
      }
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* il puntatore può essere già sparito: si trascina lo stesso */
      }
    },
    [pos.x, pos.y]
  )

  const muovi = useCallback((e: React.PointerEvent) => {
    const p = preso.current
    if (!p) return
    // ⚠️ I limiti tengono SEMPRE una parte della finestra a schermo: senza,
    // la si può spingere fuori dal bordo e non si recupera più — non c'è un
    // «rimetti a posto» se non chiudere e riaprire.
    const MARGINE = 56
    const minX = -(p.left0 + p.w - MARGINE)
    const maxX = window.innerWidth - p.left0 - MARGINE
    // In alto ci si ferma al bordo: la barra del titolo è la maniglia, se
    // esce non si può più riprendere la finestra.
    const minY = -p.top0
    const maxY = window.innerHeight - p.top0 - MARGINE
    const x = Math.max(minX, Math.min(maxX, p.x0 + (e.clientX - p.px)))
    const y = Math.max(minY, Math.min(maxY, p.y0 + (e.clientY - p.py)))
    setPos({ x, y })
  }, [])

  const finisci = useCallback((e: React.PointerEvent) => {
    preso.current = null
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* già rilasciato */
    }
  }, [])

  /** Doppio clic sul titolo: la finestra torna al centro. */
  const rimetti = useCallback(() => setPos({ x: 0, y: 0 }), [])

  return {
    /** Va sulla finestra (`.modal`). */
    ref,
    /** Va sulla finestra: lo spostamento vero. */
    stile: pos.x || pos.y ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined,
    /** Va sulla riga del titolo: è la maniglia. */
    maniglia: {
      onPointerDown: inizia,
      onPointerMove: muovi,
      onPointerUp: finisci,
      onPointerCancel: finisci,
      onDoubleClick: rimetti,
      title: 'Trascina per spostare la finestra (doppio clic: torna al centro)',
    },
    spostata: pos.x !== 0 || pos.y !== 0,
  }
}
