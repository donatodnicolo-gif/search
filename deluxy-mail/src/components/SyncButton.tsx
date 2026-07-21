'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const CHIAVE_AUTO = 'aimail:auto'

/** Etichetta leggibile dell'intervallo ("30 sec", "1 min", "10 min"). */
function etichetta(sec: number): string {
  return sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`
}

// L'intervallo lo sceglie l'utente in Impostazioni ("Controlla la posta ogni").
// Gira solo mentre la finestra è visibile.
export function SyncButton({ intervalloSec = 300 }: { intervalloSec?: number }) {
  const [stato, setStato] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<Date | null>(null)
  const [auto, setAuto] = useState(true)
  const [inCorso, setInCorso] = useState(false)
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

  // Lettura via FETCH a una rotta (non Server Action): così non entra nella
  // coda navigazioni+azioni di Next e l'app resta cliccabile mentre legge.
  // `inCorso` è un ref per evitare che due giri si sovrappongano.
  const inCorsoRef = useRef(false)
  const vai = useCallback(async () => {
    if (inCorsoRef.current) return // niente giri sovrapposti
    inCorsoRef.current = true
    setInCorso(true)
    try {
      const res = await fetch('/api/leggi-posta', { method: 'POST' })
      const esito = (await res.json().catch(() => ({}))) as { messaggio?: string; nuovi?: number }
      setStato(esito.messaggio ?? null)
      setUltimo(new Date())
      // Aggiorna la lista SOLO se è arrivato qualcosa: un refresh a vuoto
      // costa e non serve.
      if (esito.nuovi && esito.nuovi > 0) router.refresh()
    } catch {
      setStato('Lettura non riuscita: riprovo al prossimo giro.')
    } finally {
      inCorsoRef.current = false
      setInCorso(false)
    }
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
    }, Math.max(30, intervalloSec) * 1000)
    return () => clearInterval(id)
  }, [auto, intervalloSec])

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
        Automatico ogni {etichetta(Math.max(30, intervalloSec))}
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
