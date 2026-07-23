'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Esito = {
  ok: boolean
  fatti?: number
  restano?: number
  messaggio?: string
  dettaglio?: {
    contattiAI: number
    mailThreadAI: number
    mailDaLeggere: number
    riassuntiDaRifare: number
  }
}

/**
 * Fa leggere all'AI, in sottofondo, quello che ha il PLUS AI (contatti e
 * conversazioni) e che non ha ancora letto: mail non analizzate e riassunti di
 * conversazione da rifare. Chiama `/api/analizza-ai-inbox` a piccoli blocchi
 * finché non resta niente.
 *
 * ⚠️ Con `sempreVisibile` mostra SEMPRE cosa sta succedendo — anche «non c'è
 * niente da leggere». Senza, «ha già letto tutto» e «non è partito» sono
 * indistinguibili a schermo, ed è impossibile capire se funziona.
 */
export function AnalisiAIInbox({ sempreVisibile = false }: { sempreVisibile?: boolean }) {
  const [stato, setStato] = useState<'attesa' | 'lavoro' | 'finito' | 'errore'>('attesa')
  const [fatti, setFatti] = useState(0)
  const [restano, setRestano] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const attivo = useRef(true)
  const router = useRouter()

  const giro = useCallback(
    async (forzato: boolean) => {
      setErrore(null)
      setStato('lavoro')
      let totali = 0
      // Al massimo qualche blocco per volta: il resto al giro successivo.
      for (let n = 0; n < 20; n++) {
        if (!attivo.current) return
        if (!forzato && document.visibilityState !== 'visible') break

        let dati: Esito | null = null
        try {
          const res = await fetch('/api/analizza-ai-inbox', { method: 'POST' })
          if (!res.ok) {
            const corpo = (await res.json().catch(() => null)) as Esito | null
            setErrore(corpo?.messaggio || `Il server ha risposto ${res.status}.`)
            setStato('errore')
            return
          }
          dati = (await res.json()) as Esito
        } catch (e) {
          setErrore(e instanceof Error ? e.message : 'Rete non raggiungibile.')
          setStato('errore')
          return
        }

        if (!dati.ok) {
          setErrore(dati.messaggio || 'Non riuscito.')
          setStato('errore')
          return
        }

        totali += dati.fatti ?? 0
        setFatti(totali)
        setRestano(dati.restano ?? 0)

        if (!dati.restano) break
        // Un giro che non conclude niente pur avendo lavoro da fare significa
        // che l'AI non è disponibile (chiave/quota): si dice, non si insiste.
        if ((dati.fatti ?? 0) === 0) {
          setErrore('L’AI non ha potuto leggere (chiave OpenAI o quota?). Riprova più tardi.')
          setStato('errore')
          return
        }
        await new Promise((r) => setTimeout(r, 800))
      }

      setStato('finito')
      if (totali > 0 && attivo.current) router.refresh()
    },
    [router]
  )

  useEffect(() => {
    attivo.current = true
    // Ritardo breve: prima si mostra la pagina, poi si lavora.
    const avvio = setTimeout(() => void giro(false), 1500)
    return () => {
      attivo.current = false
      clearTimeout(avvio)
    }
  }, [giro])

  const lavorando = stato === 'lavoro'
  const nienteDaFare = stato === 'finito' && fatti === 0 && restano === 0

  // Senza `sempreVisibile` si resta muti quando non c'è nulla da dire.
  if (!sempreVisibile && (stato === 'attesa' || nienteDaFare)) return null

  return (
    <div style={{ fontSize: 12.5, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ color: stato === 'errore' ? 'var(--red)' : 'var(--text-tertiary)' }}>
        {stato === 'attesa' && 'Controllo se c’è da leggere…'}
        {lavorando && `L’AI sta leggendo…${restano ? ` ne restano ${restano}` : ''}`}
        {stato === 'finito' &&
          (fatti > 0
            ? `L’AI ha letto ${fatti} ${fatti === 1 ? 'elemento' : 'elementi'}.`
            : 'L’AI ha già letto tutto quello che ha il PLUS AI.')}
        {stato === 'errore' && errore}
      </span>
      {!lavorando && (
        <button type="button" className="azione-riga" onClick={() => void giro(true)}>
          Fai leggere ora
        </button>
      )}
    </div>
  )
}
