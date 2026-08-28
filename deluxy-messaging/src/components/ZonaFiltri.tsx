'use client'

import { type ReactNode, useState } from 'react'

// Zona filtri col collasso mobile (Libro UX&UI v1.2 §8): sotto la soglia i
// campi stanno dietro «Filtri (N)»; dalla soglia in su sono sempre visibili e
// il bottone non c'è (via CSS). Qui il conteggio N arriva dallo stato locale
// (quanti select non sono al default), così anche a pannello chiuso si sa
// perché la lista è ridotta. I campi restano SEMPRE montati (solo
// display:none): niente smontaggi che perderebbero lo stato dei select.
export function ZonaFiltri({ attivi = 0, children }: { attivi?: number; children: ReactNode }) {
  const [aperto, setAperto] = useState(false)
  return (
    <div className="zona-filtri" data-aperto={aperto ? '' : undefined}>
      <button type="button" className="zf-bottone" aria-expanded={aperto} onClick={() => setAperto((v) => !v)}>
        Filtri{attivi > 0 ? ` (${attivi})` : ''}
      </button>
      <div className="zf-campi">{children}</div>
    </div>
  )
}
