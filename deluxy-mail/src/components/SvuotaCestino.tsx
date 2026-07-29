'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StatoSvuota } from '@/lib/cestino'

/**
 * Svuotare il cestino è l'unica azione dell'app che cancella davvero qualcosa
 * (la copia locale e, quando la si ritrova, la mail sul server), quindi chiede
 * conferma dicendo cosa si perde e cosa no.
 *
 * ⚠️ Il lavoro NON vive più dentro questa pagina. Prima era una fetch che
 * restava appesa al componente: cambiando schermata la richiesta se ne andava
 * con lui e lo svuotamento si fermava a metà. Ora la rotta lo avvia e lo fa
 * girare per conto suo (`after()`), qui si **guarda** soltanto: si chiede a che
 * punto è, ogni tre secondi, e lo si ritrova anche riaprendo la pagina o da un
 * altro dispositivo.
 */
export function SvuotaCestino({ quanti }: { quanti: number }) {
  const [conferma, setConferma] = useState(false)
  const [stato, setStato] = useState<StatoSvuota | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inAvvio, setInAvvio] = useState(false)
  const router = useRouter()
  // Per aggiornare la lista una volta sola, quando il lavoro finisce.
  const eraInCorso = useRef(false)

  const chiediStato = useCallback(async () => {
    try {
      const res = await fetch('/api/svuota-cestino', { cache: 'no-store' })
      const dati = (await res.json()) as { stato?: StatoSvuota | null }
      setStato(dati.stato ?? null)
      if (dati.stato?.stato === 'in-corso') eraInCorso.current = true
      else if (eraInCorso.current) {
        eraInCorso.current = false
        router.refresh() // finito: la lista non deve restare piena di mail sparite
      }
    } catch {
      /* un giro a vuoto non è un errore: si riprova al prossimo */
    }
  }, [router])

  // All'apertura si guarda se c'è un lavoro in giro, e finché c'è lo si segue.
  useEffect(() => {
    void chiediStato()
  }, [chiediStato])

  useEffect(() => {
    if (stato?.stato !== 'in-corso') return
    const id = setInterval(() => void chiediStato(), 3000)
    return () => clearInterval(id)
  }, [stato?.stato, chiediStato])

  const avvia = async () => {
    setInAvvio(true)
    setErrore(null)
    try {
      const res = await fetch('/api/svuota-cestino', { method: 'POST' })
      const dati = (await res.json()) as { ok: boolean; messaggio?: string; stato?: StatoSvuota | null }
      if (dati.stato) setStato(dati.stato)
      if (!dati.ok) setErrore(dati.messaggio ?? 'Non riuscito: riprova fra poco.')
      setConferma(false)
    } catch {
      setErrore('Non riuscito: riprova fra poco.')
    } finally {
      setInAvvio(false)
    }
  }

  // ---- In corso: la riga di avanzamento, che sopravvive ai cambi di pagina ----
  if (stato?.stato === 'in-corso') {
    const perc = stato.totali > 0 ? Math.min(100, Math.round((stato.fatte / stato.totali) * 100)) : 0
    return (
      <div className="svuota-stato">
        <span className="badge orange">
          <span className="dot" />
          Svuoto il cestino
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {stato.fase} {stato.totali > 0 && `${stato.fatte} di ${stato.totali} (${perc}%)`}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Va avanti da sé: <strong>puoi cambiare schermata o chiudere l’app</strong>.
        </span>
      </div>
    )
  }

  // ---- Interrotto (la funzione ha un tetto di 5 minuti): si riprende ----
  if (stato?.stato === 'interrotto') {
    return (
      <div className="svuota-stato">
        <span style={{ fontSize: 13, color: 'var(--red)' }}>{stato.messaggio}</span>
        <button className="btn danger small" disabled={inAvvio} onClick={avvia}>
          {inAvvio ? 'Riprendo…' : 'Riprendi'}
        </button>
      </div>
    )
  }

  // ---- Finito: l'esito resta finché non si ricarica la pagina ----
  if (stato?.stato === 'finito' && stato.messaggio) {
    return (
      <span style={{ fontSize: 13, color: stato.ok ? 'var(--text-secondary)' : 'var(--red)' }}>
        {stato.messaggio}
      </span>
    )
  }

  if (!conferma) {
    return (
      <div className="svuota-stato">
        {errore && <span style={{ fontSize: 13, color: 'var(--red)' }}>{errore}</span>}
        <button className="btn danger small" onClick={() => setConferma(true)}>
          Svuota cestino
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 380 }}>
        Rimuovo {quanti} messaggi da AI Mail. Le mail restano sulla casella, ma qui si perdono
        riassunti, attività, bozze e priorità.
      </span>
      <button className="btn secondary small" onClick={() => setConferma(false)} disabled={inAvvio}>
        Annulla
      </button>
      <button className="btn danger small" disabled={inAvvio} onClick={avvia}>
        {inAvvio ? 'Avvio…' : 'Confermo'}
      </button>
    </div>
  )
}
