'use client'

import { useEffect, useRef, useState } from 'react'
import { RigaMail, type RigaData } from './RigaMail'

const PASSO = 25

/**
 * La lista della posta con caricamento progressivo: monta 25 conversazioni per
 * volta man mano che scorri (o col pulsante). Così l'apertura è leggera anche
 * con molta posta — si idratano solo le righe visibili.
 */
export function ListaMail({ righe }: { righe: RigaData[] }) {
  const [mostrate, setMostrate] = useState(PASSO)
  const sentinella = useRef<HTMLDivElement>(null)

  const visibili = righe.slice(0, mostrate)
  const restano = righe.length - visibili.length

  // Appena la sentinella (in fondo alla lista) entra in vista, carica altre 25.
  useEffect(() => {
    if (restano <= 0) return
    const el = sentinella.current
    if (!el) return
    const obs = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) setMostrate((n) => n + PASSO)
      },
      { rootMargin: '400px' } // anticipa: carica prima di arrivare in fondo
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [restano])

  return (
    <div className="mail-list">
      {visibili.map((r) => (
        <RigaMail key={r.id} r={r} />
      ))}

      {restano > 0 && (
        <div ref={sentinella} className="mail-carica">
          <button type="button" className="btn secondary small" onClick={() => setMostrate((n) => n + PASSO)}>
            Carica altre {Math.min(PASSO, restano)} · ne restano {restano}
          </button>
        </div>
      )}
    </div>
  )
}
