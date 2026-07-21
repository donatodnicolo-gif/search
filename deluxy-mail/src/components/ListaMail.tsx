'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RigaMail, type RigaData } from './RigaMail'

const PASSO = 50

/**
 * La lista della posta con caricamento progressivo: monta 50 conversazioni per
 * volta man mano che scorri (o col pulsante). Così l'apertura è leggera anche
 * con molta posta — si idratano solo le righe visibili.
 *
 * Il caricamento è a PROVA di blocco: oltre all'IntersectionObserver c'è un
 * fallback su scroll/resize (se per qualunque motivo l'osservatore non scatta,
 * lo scorrimento continua a caricare) e un auto-riempimento iniziale (se la
 * lista è più corta della finestra, carica finché non la riempie o finisce).
 */
export function ListaMail({
  righe,
  sezioni = [],
}: {
  righe: RigaData[]
  sezioni?: { id: string; nome: string }[]
}) {
  const [mostrate, setMostrate] = useState(PASSO)
  const sentinella = useRef<HTMLDivElement>(null)

  const visibili = righe.slice(0, mostrate)
  const restano = righe.length - visibili.length

  const carica = useCallback(
    () => setMostrate((n) => Math.min(n + PASSO, righe.length)),
    [righe.length]
  )

  useEffect(() => {
    if (restano <= 0) return
    const el = sentinella.current
    if (!el) return

    // La sentinella è "in arrivo" se il suo bordo alto è entro 600px dal fondo
    // della finestra: allora conviene caricare la pagina successiva.
    const vicino = () => {
      const finestra = window.innerHeight || document.documentElement.clientHeight
      return el.getBoundingClientRect().top <= finestra + 600
    }
    const forse = () => {
      if (vicino()) carica()
    }

    const obs = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) carica()
      },
      { rootMargin: '600px' }
    )
    obs.observe(el)
    window.addEventListener('scroll', forse, { passive: true })
    window.addEventListener('resize', forse)
    // Riempi subito se la sentinella è già in vista (lista più corta della finestra).
    forse()

    return () => {
      obs.disconnect()
      window.removeEventListener('scroll', forse)
      window.removeEventListener('resize', forse)
    }
  }, [restano, carica])

  return (
    <div className="mail-list">
      {visibili.map((r) => (
        <RigaMail key={r.id} r={r} sezioni={sezioni} />
      ))}

      {restano > 0 && (
        <div ref={sentinella} className="mail-carica">
          <button type="button" className="btn secondary small" onClick={carica}>
            Carica altre {Math.min(PASSO, restano)} · ne restano {restano}
          </button>
        </div>
      )}
    </div>
  )
}
