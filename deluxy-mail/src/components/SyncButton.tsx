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
  function cambiaAuto(acceso: boolean) {
    setAuto(acceso)
    window.localStorage.setItem(CHIAVE_AUTO, acceso ? 'on' : 'off')
  }

  // Lettura via FETCH a una rotta (non Server Action): così non entra nella
  // coda navigazioni+azioni di Next e l'app resta cliccabile mentre legge.
  // `inCorsoRef` evita che due giri si sovrappongano.
  const inCorsoRef = useRef(false)

  // Un singolo giro breve: chiede la posta nuova (budget ~7s lato server, il
  // cursore avanza da solo) e torna quanti messaggi ha scaricato.
  const unGiro = useCallback(async (): Promise<number> => {
    const res = await fetch('/api/leggi-posta', { method: 'POST' })
    const esito = (await res.json().catch(() => ({}))) as { messaggio?: string; nuovi?: number }
    setStato(esito.messaggio ?? null)
    setUltimo(new Date())
    const nuovi = esito.nuovi ?? 0
    // Aggiorna la lista SOLO se è arrivato qualcosa: un refresh a vuoto non serve.
    if (nuovi > 0) router.refresh()
    return nuovi
  }, [router])

  // Giro singolo (pulsante "Aggiorna posta" e timer): non si sovrappone.
  const vai = useCallback(async () => {
    if (inCorsoRef.current) return
    inCorsoRef.current = true
    setInCorso(true)
    try {
      await unGiro()
    } catch {
      setStato('Lettura non riuscita: riprovo al prossimo giro.')
    } finally {
      inCorsoRef.current = false
      setInCorso(false)
    }
  }, [unGiro])

  // ALL'APERTURA dell'app: scarica TUTTA la posta nuova non ancora scaricata,
  // un blocco alla volta, ripetendo il giro breve finché non arriva più niente.
  // Resta in background (fetch) → l'app è usabile mentre scarica; si ferma se
  // lasci la scheda o quando un giro non porta nulla.
  const drena = useCallback(async () => {
    if (inCorsoRef.current) return
    inCorsoRef.current = true
    setInCorso(true)
    try {
      for (let giro = 0; giro < 50; giro++) {
        if (document.visibilityState !== 'visible') break
        const nuovi = await unGiro()
        if (nuovi <= 0) break // arretrato esaurito
      }
    } catch {
      setStato('Lettura non riuscita: riprovo al prossimo giro.')
    } finally {
      inCorsoRef.current = false
      setInCorso(false)
    }
  }, [unGiro])

  // I giri stanno in ref: rifare gli effetti a ogni render li farebbe ripartire
  // da capo di continuo.
  const vaiRef = useRef(vai)
  vaiRef.current = vai
  const drenaRef = useRef(drena)
  drenaRef.current = drena

  // Al montaggio (= apertura dell'app): leggo la preferenza di questo dispositivo
  // e, se l'automatico è acceso e la scheda è in primo piano, avvio subito lo
  // scarico di tutta la posta arretrata.
  useEffect(() => {
    const acceso = window.localStorage.getItem(CHIAVE_AUTO) !== 'off'
    setAuto(acceso)
    if (acceso && document.visibilityState === 'visible') drenaRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
