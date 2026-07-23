'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cestinaThread, riassumiConversazione } from '@/lib/actions'
import { AgganciaBottone } from './AgganciaRiga'
import { NomeThreadBottone } from './NomeThreadRiga'
import { ThreadAIToggle } from './ThreadAIToggle'

/**
 * Le azioni su un intero thread (nella lista Thread): riassunto rapido, aggancia
 * altre mail, e cestina tutte le mail del thread. `messaggioId` è un messaggio
 * qualsiasi del thread (il volto della riga).
 */
export function AzioniThread({
  messaggioId,
  nome,
  aiAttivo = false,
}: {
  messaggioId: string
  nome?: string | null
  /** True se la conversazione ha già il PLUS AI. */
  aiAttivo?: boolean
}) {
  const [inCorso, start] = useTransition()
  const [sintesi, setSintesi] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [via, setVia] = useState(false) // cestinato: la riga svanisce
  const router = useRouter()

  if (via) return null

  const riassumi = () =>
    start(async () => {
      setErrore(null)
      const r = await riassumiConversazione(messaggioId)
      if (r.ok && r.riassunto) setSintesi(r.riassunto.analisi.sintesi)
      else setErrore(r.messaggio)
    })

  const cestina = () =>
    start(async () => {
      setVia(true)
      await cestinaThread(messaggioId)
      router.refresh()
    })

  return (
    <div style={{ paddingLeft: 17, marginTop: 6 }}>
      <div className="riga-azioni" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="azione-riga" disabled={inCorso} onClick={riassumi}>
          {inCorso && !via ? 'Riassumo…' : sintesi ? 'Rigenera riassunto' : 'Riassunto rapido'}
        </button>
        {/* PLUS AI sulla conversazione, acceso/spento da qui. */}
        <ThreadAIToggle messaggioId={messaggioId} attivo={aiAttivo} variante="riga" />
        <AgganciaBottone id={messaggioId} />
        <NomeThreadBottone id={messaggioId} nome={nome} />
        <button
          type="button"
          className="azione-riga"
          disabled={inCorso}
          title="Sposta nel cestino tutte le mail di questo thread"
          onClick={cestina}
        >
          Cestina tutto
        </button>
      </div>

      {errore && (
        <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{errore}</div>
      )}
      {sintesi && (
        <div className="ai-box" style={{ marginTop: 8, padding: '10px 12px' }}>
          <div className="ai-box-text" style={{ fontSize: 13.5 }}>
            <span className="ai-mark">AI</span> {sintesi}
          </div>
        </div>
      )}
    </div>
  )
}
