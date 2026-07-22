'use client'

import { useState } from 'react'
import { SequenzaForm } from './SequenzaForm'

/** Il bottone "+ Nuova sequenza" che apre l'editor. */
export function NuovaSequenza() {
  const [aperto, setAperto] = useState(false)
  if (!aperto) {
    return (
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn primary" onClick={() => setAperto(true)}>
          + Nuova sequenza
        </button>
      </div>
    )
  }
  return <SequenzaForm onChiudi={() => setAperto(false)} />
}
