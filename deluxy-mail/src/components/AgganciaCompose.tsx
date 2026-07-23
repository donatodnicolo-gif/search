'use client'

import { useState, useTransition } from 'react'
import { cercaDaAgganciare, type CandidatoAggancio } from '@/lib/actions'
import { dataBreve } from '@/lib/format'

export type ScelraAggancio = { id: string; oggetto: string } | null

/**
 * «Aggancia a una conversazione» in fase di SCRITTURA (inoltro e mail nuova).
 *
 * Un inoltro e una mail scritta da zero aprono sempre una conversazione nuova:
 * non hanno legami con l'originale (né catena di risposte né oggetto in comune).
 * Qui si sceglie PRIMA di inviare in quale conversazione far finire la mail:
 * l'aggancio vero (threadManuale) viene applicato dal server subito dopo
 * l'invio, sulla copia registrata in "Posta inviata".
 *
 * La scelta è solo un'intenzione finché non si invia: qui non si tocca niente.
 */
export function AgganciaCompose({
  scelta,
  onScelta,
}: {
  scelta: ScelraAggancio
  onScelta: (s: ScelraAggancio) => void
}) {
  const [aperto, setAperto] = useState(false)
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<CandidatoAggancio[] | null>(null)
  const [inCorso, start] = useTransition()

  const cerca = () =>
    start(async () => {
      // Stringa vuota come base: qui la mail non esiste ancora, non c'è una
      // conversazione di partenza da escludere.
      setRisultati(await cercaDaAgganciare('', query))
    })

  // Già scelta: si mostra solo il riepilogo, con la possibilità di togliere.
  if (scelta) {
    return (
      <div className="full">
        <label className="field-label">Conversazione</label>
        <div className="aggancio-scelto">
          <span className="badge neutral">
            <span className="dot" />
            Andrà in «{scelta.oggetto || '(senza oggetto)'}»
          </span>
          <button
            type="button"
            className="azione-riga"
            onClick={() => {
              onScelta(null)
              setAperto(false)
              setRisultati(null)
            }}
          >
            Togli
          </button>
        </div>
      </div>
    )
  }

  if (!aperto) {
    return (
      <div className="full">
        <button type="button" className="azione-riga" onClick={() => setAperto(true)}>
          ⚭ Aggancia a una conversazione
        </button>
      </div>
    )
  }

  return (
    <div className="full">
      <label className="field-label">Aggancia a una conversazione</label>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Cerca la conversazione (per oggetto o mittente): la mail che stai per mandare finirà lì
        dentro, così resta insieme al resto dello scambio.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (query.trim().length >= 2) cerca()
            }
          }}
          placeholder="Es. preventivo hotel, oppure marco@"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn secondary small"
          onClick={cerca}
          disabled={inCorso || query.trim().length < 2}
        >
          {inCorso ? 'Cerco…' : 'Cerca'}
        </button>
        <button
          type="button"
          className="btn secondary small"
          onClick={() => {
            setAperto(false)
            setRisultati(null)
          }}
        >
          Annulla
        </button>
      </div>

      {risultati && (
        <div style={{ marginTop: 10 }}>
          {risultati.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nessuna conversazione trovata.</div>
          ) : (
            risultati.map((r) => (
              <div key={r.id} className="aggancio-riga">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{r.oggetto || '(senza oggetto)'}</span>
                    {r.nel > 1 && <span className="badge neutral" style={{ flexShrink: 0 }}>{r.nel} messaggi</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {r.mittenteNome || r.mittente} · {dataBreve(r.data)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => {
                    onScelta({ id: r.id, oggetto: r.oggetto })
                    setAperto(false)
                    setRisultati(null)
                  }}
                >
                  Scegli
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
