'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AzioneDescritta } from '@/lib/appDeluxy'

/**
 * Il pannello APP DELUXY nella colonna destra: una carta per funzione.
 * Trascinaci sopra una mail: la carta in alto ("Automatico") decide con le
 * regole APP DELUXY; le altre chiamano la loro funzione. In ogni caso l'AI
 * prepara i dati e l'utente conferma nel dialogo.
 */
export function CarteApp({ azioni }: { azioni: AzioneDescritta[] }) {
  const [sopra, setSopra] = useState<string | null>(null)

  const apri = (messaggioId: string, azioneId?: string) => {
    window.dispatchEvent(new CustomEvent('aimail:app', { detail: { messaggioId, azioneId } }))
  }

  const gestori = (chiave: string, azioneId?: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('text/aimail-id')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setSopra(chiave)
      }
    },
    onDragLeave: () => setSopra((s) => (s === chiave ? null : s)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setSopra(null)
      const id = e.dataTransfer.getData('text/aimail-id')
      if (id) apri(id, azioneId)
    },
  })

  return (
    <div className="carte-app">
      <div className="col-attivita-head">
        <span className="nav-label" style={{ padding: 0 }}>
          APP AI Deluxy
        </span>
        <Link href="/regole" className="azione-riga" title="Le regole APP DELUXY">
          Regole
        </Link>
      </div>

      {azioni.map((a) => (
        <div
          key={a.id}
          className={`app-card ${sopra === a.id ? 'sopra' : ''} ${a.configurata ? '' : 'spenta'}`}
          {...gestori(a.id, a.id)}
        >
          <div className="app-card-nome">
            <span className={`badge ${a.colore}`}>
              <span className="dot" />
              {a.app}
            </span>
            {a.nome}
          </div>
          <div className="app-card-desc">
            {a.configurata ? a.descrizione : 'Da collegare: manca la chiave API sul server.'}
          </div>
        </div>
      ))}
    </div>
  )
}
