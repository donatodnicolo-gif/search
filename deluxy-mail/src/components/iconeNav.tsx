/**
 * Icone delle voci di navigazione (M9 — 27/08/2026).
 *
 * Il CSS `.nav-item svg` (globals.css:97, 19px, stroke 1.7, colore da
 * `--text-secondary`/oro sull'attiva) c'era da sempre, ma NESSUNA voce montava
 * un'icona: la sidebar era una colonna di sole scritte. Qui vivono le icone,
 * stile SF Symbols / Feather, tratto 1.7, `fill=none`, colore ereditato dal CSS
 * (mai hardcodato). Si scelgono per LABEL della voce, che è stabile.
 */
import type { ReactNode } from 'react'

const S = {
  fill: 'none' as const,
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function svg(children: ReactNode): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...S}>
      {children}
    </svg>
  )
}

const ICONE: Record<string, ReactNode> = {
  'Posta in arrivo': svg(
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>,
  ),
  Bozze: svg(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </>,
  ),
  'Posta inviata': svg(
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>,
  ),
  Archivio: svg(
    <>
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </>,
  ),
  Spam: svg(
    <>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>,
  ),
  Cestino: svg(
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </>,
  ),
  Thread: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  Clienti: svg(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>,
  ),
  'Attività': svg(
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>,
  ),
  Riassunti: svg(<path d="M17 10H3M21 6H3M21 14H3M17 18H3" />),
  Rubrica: svg(
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>,
  ),
  'Risposte rapide': svg(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />),
  'Renè AI': svg(<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" />),
  Calendario: svg(
    <>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
    </>,
  ),
  Sequenze: svg(
    <>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>,
  ),
  Regole: svg(<path d="M22 3H2l8 9.46V19l4 2v-8.54z" />),
  Sezioni: svg(<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />),
  Statistiche: svg(<path d="M18 20V10M12 20V4M6 20v-6" />),
  'Impostazioni App': svg(<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />),
  Impostazioni: svg(
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>,
  ),
  Utenti: svg(
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </>,
  ),
}

// Ripiego neutro per una voce senza icona dedicata: un cerchio, non il vuoto.
const RIPIEGO: ReactNode = svg(<circle cx="12" cy="12" r="8" />)

export function iconaPerVoce(label: string): ReactNode {
  return ICONE[label] ?? RIPIEGO
}
