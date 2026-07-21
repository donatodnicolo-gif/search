'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { comandoPostaAnteprima, comandoPostaEsegui } from '@/lib/actions'
import { mostraFlash } from './Flash'

type Anteprima = {
  ok: boolean
  messaggio: string
  azione?: 'cestina' | 'archivia'
  criterio?: 'mittente' | 'oggetto'
  valore?: string
  quanti?: number
}

/**
 * "Chiedi a Renè": un comando a parole su un gruppo di mail — es. «cancella
 * tutte le mail di mario@…» o «archivia le mail con oggetto sollecito». Mai
 * distruttivo di colpo: prima MOSTRA quante mail toccherebbe e chiede conferma.
 * Cestinare = recuperabile dal Cestino.
 */
export function ComandoRene() {
  const [testo, setTesto] = useState('')
  const [ant, setAnt] = useState<Anteprima | null>(null)
  const [inCorso, start] = useTransition()
  const router = useRouter()

  const chiedi = () =>
    start(async () => {
      setAnt(null)
      const r = await comandoPostaAnteprima(testo)
      setAnt(r)
    })

  const conferma = () =>
    start(async () => {
      if (!ant?.azione || !ant.criterio || !ant.valore) return
      const r = await comandoPostaEsegui(ant.azione, ant.criterio, ant.valore)
      mostraFlash(r.messaggio)
      setAnt(null)
      setTesto('')
      router.refresh()
    })

  // Serve conferma solo se c'è davvero qualcosa da toccare.
  const daConfermare = ant?.ok && (ant.quanti ?? 0) > 0

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="ai-box-title" style={{ marginBottom: 8 }}>
        <span className="ai-toggle-mark">AI</span> Chiedi a Renè
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
        Comandi su un gruppo di mail. Es. «cancella tutte le mail di mario@rossi.it», «cestina le
        mail di LimoLane», «archivia le mail con oggetto sollecito». Prima di agire ti dico quante
        ne tocco e chiedo conferma (il cestino è recuperabile).
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value)
            setAnt(null)
          }}
          placeholder="Es. cancella tutte le mail di …"
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', fontSize: 14 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && testo.trim() && !daConfermare) chiedi()
          }}
        />
        {!daConfermare ? (
          <button className="btn secondary" type="button" onClick={chiedi} disabled={inCorso || !testo.trim()}>
            {inCorso ? 'Penso…' : 'Chiedi'}
          </button>
        ) : (
          <>
            <button className="btn secondary" type="button" onClick={() => setAnt(null)} disabled={inCorso}>
              Annulla
            </button>
            <button className="btn danger" type="button" onClick={conferma} disabled={inCorso}>
              {inCorso ? 'Eseguo…' : `Sì, ${ant?.azione === 'cestina' ? 'cestina' : 'archivia'} ${ant?.quanti}`}
            </button>
          </>
        )}
      </div>
      {ant && (
        <div
          style={{
            fontSize: 13,
            marginTop: 10,
            color: ant.ok ? 'var(--text-secondary)' : 'var(--red)',
          }}
        >
          {ant.messaggio}
        </div>
      )}
    </div>
  )
}
