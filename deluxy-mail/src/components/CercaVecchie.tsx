'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * In fondo alla lista: quando ci arrivi e la casella ha ancora storico non
 * scaricato, va a prendere UN blocco di mail più vecchie dal server IMAP
 * (on-demand, senza bisogno dell'impostazione "scarica tutto in background").
 * Un blocco per volta, col suo respiro: niente loop che consumano CPU.
 */
export function CercaVecchie() {
  const [stato, setStato] = useState<'fermo' | 'cerco' | 'finito'>('fermo')
  const sentinella = useRef<HTMLDivElement>(null)
  const inCorso = useRef(false)
  const ultimaChiamata = useRef(0)
  const router = useRouter()

  const cerca = async () => {
    if (inCorso.current) return
    // Respiro minimo fra due blocchi: l'observer può rinotificare subito.
    if (Date.now() - ultimaChiamata.current < 2000) return
    inCorso.current = true
    ultimaChiamata.current = Date.now()
    setStato('cerco')
    try {
      const res = await fetch('/api/scarica-storico', { method: 'POST' })
      if (!res.ok) {
        setStato('fermo')
        return
      }
      const esito = (await res.json().catch(() => ({}))) as { scaricati?: number; finito?: boolean }
      if (esito.scaricati && esito.scaricati > 0) router.refresh()
      setStato(esito.finito ? 'finito' : 'fermo')
    } catch {
      setStato('fermo')
    } finally {
      inCorso.current = false
    }
  }

  useEffect(() => {
    if (stato === 'finito') return
    const el = sentinella.current
    if (!el) return
    const obs = new IntersectionObserver(
      (voci) => {
        if (voci.some((v) => v.isIntersecting)) void cerca()
      },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stato])

  if (stato === 'finito') {
    return (
      <div className="mail-carica" style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
        Hai tutta la posta: non c’è altro sul server.
      </div>
    )
  }

  return (
    <div ref={sentinella} className="mail-carica">
      <button type="button" className="btn secondary small" onClick={cerca} disabled={stato === 'cerco'}>
        {stato === 'cerco' ? 'Cerco sul server…' : 'Cerca messaggi più vecchi sul server'}
      </button>
    </div>
  )
}
