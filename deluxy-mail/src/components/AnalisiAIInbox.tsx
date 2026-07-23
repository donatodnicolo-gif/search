'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Fa leggere all'AI, in sottofondo, le mail dei contatti col PLUS AI che non
 * ha ancora letto. Gira solo con la AI Inbox aperta e in primo piano: chiama
 * `/api/analizza-ai-inbox` a piccoli blocchi finché non resta niente.
 *
 * Non blocca nulla: è una fetch (non una Server Action), i clic restano liberi
 * e la lista si aggiorna quando il giro è finito.
 */
export function AnalisiAIInbox() {
  const [stato, setStato] = useState<{ fatti: number; restano: number } | null>(null)
  const attivo = useRef(true)
  const router = useRouter()

  useEffect(() => {
    attivo.current = true
    let fattiTotali = 0

    const giro = async () => {
      // Fermarsi se la scheda passa in secondo piano: l'analisi costa, e la si
      // fa solo per chi sta davvero guardando la AI Inbox.
      while (attivo.current && document.visibilityState === 'visible') {
        let dati: { ok: boolean; fatti?: number; restano?: number } | null = null
        try {
          const res = await fetch('/api/analizza-ai-inbox', { method: 'POST' })
          dati = await res.json()
        } catch {
          return // rete giù: si riproverà alla prossima apertura
        }
        if (!dati?.ok) return
        fattiTotali += dati.fatti ?? 0
        setStato({ fatti: fattiTotali, restano: dati.restano ?? 0 })

        if (!dati.restano) {
          if (fattiTotali > 0 && attivo.current) router.refresh()
          return
        }
        // Se un giro non ha concluso niente ma ne restano, è inutile insistere
        // (AI non disponibile): si riprova alla prossima apertura.
        if ((dati.fatti ?? 0) === 0) return

        // Un attimo di respiro fra un blocco e l'altro.
        await new Promise((r) => setTimeout(r, 1200))
      }
    }

    // Ritardo iniziale: prima si mostra la posta, poi si lavora.
    const avvio = setTimeout(giro, 2000)
    return () => {
      attivo.current = false
      clearTimeout(avvio)
    }
  }, [router])

  if (!stato || (stato.restano === 0 && stato.fatti === 0)) return null

  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
      {stato.restano > 0
        ? `L’AI sta leggendo le mail dei contatti AI… ne restano ${stato.restano}.`
        : `L’AI ha letto ${stato.fatti} ${stato.fatti === 1 ? 'mail' : 'mail'} dei contatti AI.`}
    </div>
  )
}
