'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sincronizzaOra } from '@/lib/actions'

// Ogni quanto controllare la posta da solo. 5 minuti: abbastanza da sembrare
// istantaneo, abbastanza raro da non pesare sul server IMAP.
const OGNI_MS = 5 * 60 * 1000
const CHIAVE_AUTO = 'aimail:auto'

export function SyncButton() {
  const [stato, setStato] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<Date | null>(null)
  const [auto, setAuto] = useState(true)
  const [inCorso, startTransition] = useTransition()
  const router = useRouter()

  // La preferenza vive nel browser: è una scelta di questo dispositivo, non
  // dell'account (sul telefono puoi volerlo spento e sul desktop acceso).
  useEffect(() => {
    setAuto(window.localStorage.getItem(CHIAVE_AUTO) !== 'off')
  }, [])

  function cambiaAuto(acceso: boolean) {
    setAuto(acceso)
    window.localStorage.setItem(CHIAVE_AUTO, acceso ? 'on' : 'off')
  }

  const vai = useCallback(() => {
    startTransition(async () => {
      const esito = await sincronizzaOra()
      setStato(esito.messaggio)
      setUltimo(new Date())
      router.refresh()
    })
  }, [router])

  // Il timer sta in un ref: rifare l'intervallo a ogni render lo farebbe
  // ripartire da capo di continuo e non scatterebbe mai.
  const vaiRef = useRef(vai)
  vaiRef.current = vai

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      // Niente sincronizzazioni a vuoto mentre la finestra è nascosta: si
      // riparte quando torni sull'app.
      if (document.visibilityState === 'visible') vaiRef.current()
    }, OGNI_MS)
    return () => clearInterval(id)
  }, [auto])

  return (
    <div style={{ padding: '0 10px 4px' }}>
      <button className="btn primary" onClick={vai} disabled={inCorso} style={{ width: '100%' }}>
        {inCorso ? 'Leggo la posta…' : 'Aggiorna posta'}
      </button>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 9,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => cambiaAuto(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--ink)' }}
        />
        Automatico ogni 5 min
      </label>

      {stato && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
          {stato}
        </div>
      )}
      {ultimo && !stato && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Ultimo controllo alle {ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}
