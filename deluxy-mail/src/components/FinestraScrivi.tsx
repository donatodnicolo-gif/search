'use client'

import { useEffect, useState, useTransition } from 'react'
import { preparaComposizione } from '@/lib/actions'
import { Composizione } from './Composizione'
import type { Modo } from '@/lib/rispondi'

type Dati = {
  modo: Modo
  da: string
  oggettoOriginale: string
  iniziale: { a: string; cc: string; oggetto: string; corpo: string }
  contatti: { email: string; nome: string | null }[]
  sequenze: { id: string; nome: string }[]
  tradurreIn: string | null
}

const APRI = 'aimail:scrivi'
/** Sotto questa larghezza si va alla pagina intera: una finestra su schermo
 *  stretto coprirebbe tutto. */
const LARGHEZZA_MINIMA = 900

/** Le righe la usano per sapere se possono aprire la finestra invece di
 *  navigare (la finestra è montata solo su alcune pagine). */
export function finestraDisponibile(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as { __aimailFinestra?: boolean }).__aimailFinestra) &&
    window.innerWidth >= LARGHEZZA_MINIMA
  )
}

/** Apre la finestra di scrittura per una mail. */
export function apriFinestraScrivi(messaggioId: string, modo: string) {
  window.dispatchEvent(new CustomEvent(APRI, { detail: { messaggioId, modo } }))
}

const TITOLO: Record<Modo, string> = {
  rispondi: 'Rispondi',
  tutti: 'Rispondi a tutti',
  inoltra: 'Inoltra',
}

/**
 * La finestra di scrittura in basso a destra: si risponde (o si inoltra) senza
 * lasciare la posta in arrivo. Dentro c'è la STESSA `Composizione` della pagina
 * intera — non una copia semplificata: allegati, priorità, sequenze, aggancio e
 * conferma d'invio funzionano identici.
 *
 * Montata UNA volta per pagina. Solo desktop: sotto i 900px le righe portano
 * alla pagina come prima.
 */
export function FinestraScrivi() {
  const [messaggioId, setMessaggioId] = useState<string | null>(null)
  const [dati, setDati] = useState<Dati | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ridotta, setRidotta] = useState(false)
  const [inCorso, start] = useTransition()

  // Segnala alle righe che la finestra c'è (vedi `finestraDisponibile`).
  useEffect(() => {
    ;(window as { __aimailFinestra?: boolean }).__aimailFinestra = true
    return () => {
      ;(window as { __aimailFinestra?: boolean }).__aimailFinestra = false
    }
  }, [])

  useEffect(() => {
    const su = (e: Event) => {
      const d = (e as CustomEvent).detail as { messaggioId: string; modo: string }
      setMessaggioId(d.messaggioId)
      setDati(null)
      setErrore(null)
      setRidotta(false)
      start(async () => {
        const r = await preparaComposizione(d.messaggioId, d.modo)
        if (!r.ok || !r.iniziale || !r.modo) {
          setErrore(r.messaggio ?? 'Non riesco ad aprire la scrittura.')
          return
        }
        setDati({
          modo: r.modo,
          da: r.da ?? '',
          oggettoOriginale: r.oggettoOriginale ?? '',
          iniziale: r.iniziale,
          contatti: r.contatti ?? [],
          sequenze: r.sequenze ?? [],
          tradurreIn: r.tradurreIn ?? null,
        })
      })
    }
    window.addEventListener(APRI, su)
    return () => window.removeEventListener(APRI, su)
  }, [])

  if (!messaggioId) return null
  const chiudi = () => {
    setMessaggioId(null)
    setDati(null)
  }

  return (
    <div className={`finestra-scrivi ${ridotta ? 'ridotta' : ''}`} role="dialog" aria-label="Scrivi">
      <div className="finestra-testa">
        <span className="finestra-titolo">
          {dati ? TITOLO[dati.modo] : 'Scrivi'}
          {dati?.oggettoOriginale && !ridotta && (
            <span className="finestra-oggetto"> · {dati.oggettoOriginale}</span>
          )}
        </span>
        <span className="finestra-azioni">
          <button
            type="button"
            className="finestra-icona"
            onClick={() => setRidotta((r) => !r)}
            title={ridotta ? 'Riapri' : 'Riduci a icona'}
            aria-label={ridotta ? 'Riapri' : 'Riduci'}
          >
            {ridotta ? '▲' : '▼'}
          </button>
          <button type="button" className="finestra-icona" onClick={chiudi} title="Chiudi" aria-label="Chiudi">
            ✕
          </button>
        </span>
      </div>

      {!ridotta && (
        <div className="finestra-corpo">
          {inCorso && !dati && <div style={{ padding: 18, fontSize: 13.5 }}>Preparo…</div>}
          {errore && <div style={{ padding: 18, fontSize: 13.5, color: 'var(--red)' }}>{errore}</div>}
          {dati && (
            <>
              {dati.tradurreIn && (
                <div className="ai-box" style={{ marginBottom: 12 }}>
                  <div className="ai-box-text">
                    Questa mail è in <strong>{dati.tradurreIn}</strong>. Scrivi pure in italiano: all’invio
                    la traduco io.
                  </div>
                </div>
              )}
              <Composizione
                messaggioId={messaggioId}
                modo={dati.modo}
                da={dati.da}
                iniziale={dati.iniziale}
                // Restando in posta in arrivo non si va da nessuna parte:
                // la finestra si chiude e la lista si aggiorna da sola.
                tornaA=""
                contatti={dati.contatti}
                sequenze={dati.sequenze}
                onFatto={chiudi}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
