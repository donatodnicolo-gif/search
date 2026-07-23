'use client'

import { useEffect, useState } from 'react'
import { elencoAllegati } from '@/lib/actions'

type Allegato = { nome: string; tipo: string; dimensione: number }

function dimensioneUmana(byte: number): string {
  if (!byte) return ''
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Elenca gli allegati di una mail e li fa scaricare. Il contenuto NON è salvato:
 * l'elenco si legge dal server dopo il render (non rallenta l'apertura) e ogni
 * file si scarica on-demand da /api/allegato.
 */
export function AllegatiMessaggio({ messaggioId, quanti }: { messaggioId: string; quanti: number }) {
  const [allegati, setAllegati] = useState<Allegato[] | null>(null)
  const [errore, setErrore] = useState(false)

  useEffect(() => {
    let vivo = true
    elencoAllegati(messaggioId)
      .then((a) => {
        if (vivo) setAllegati(a)
      })
      .catch(() => {
        if (vivo) setErrore(true)
      })
    return () => {
      vivo = false
    }
  }, [messaggioId])

  return (
    <div className="allegati-box">
      <div className="allegati-titolo">
        <span>
          📎 {quanti} allegat{quanti === 1 ? 'o' : 'i'}
        </span>
        {/* Con più di un allegato: tutto in un solo .zip, così non si clicca
            venti volte. Lo zip si costruisce al momento sul server. */}
        {allegati && allegati.length > 1 && (
          <a
            className="btn secondary small"
            href={`/api/allegati-zip?messaggio=${encodeURIComponent(messaggioId)}`}
            title="Scarica tutti gli allegati in un unico archivio .zip"
          >
            ⤓ Scarica tutti ({allegati.length})
          </a>
        )}
      </div>
      {allegati === null && !errore && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Carico dal server…</div>
      )}
      {errore && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Non sono riuscito a leggere gli allegati dal server.
        </div>
      )}
      {allegati && allegati.length > 0 && (
        <div className="allegati-lista">
          {allegati.map((a, i) => (
            <a
              key={i}
              className="allegato-voce"
              href={`/api/allegato?messaggio=${encodeURIComponent(messaggioId)}&i=${i}`}
              download={a.nome}
            >
              <span className="allegato-nome">{a.nome}</span>
              <span className="allegato-dim">{dimensioneUmana(a.dimensione)} · Scarica</span>
            </a>
          ))}
        </div>
      )}
      {allegati && allegati.length === 0 && !errore && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Allegati non recuperabili (mail non più sul server?).
        </div>
      )}
    </div>
  )
}
