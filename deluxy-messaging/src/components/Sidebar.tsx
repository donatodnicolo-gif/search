'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Menu laterale (stesso impianto di Deluxy Orders). È un client component solo
// per evidenziare la voce attiva.
export function Sidebar() {
  const path = usePathname()

  const gruppi = [
    {
      titolo: 'Ordini',
      voci: [
        { href: '/', nome: 'Ordini', icona: iconaLista },
        { href: '/calendario', nome: 'Calendario', icona: iconaCalendario },
        { href: '/clienti', nome: 'Clienti', icona: iconaClienti },
        { href: '/pagamenti', nome: 'Pagamenti', icona: iconaPagamenti },
      ],
    },
    {
      titolo: 'Messaggi',
      voci: [
        { href: '/inbox', nome: 'Inbox', icona: iconaChat },
        { href: '/script', nome: 'Script', icona: iconaScript },
      ],
    },
    {
      titolo: 'Configurazione',
      voci: [
        { href: '/negozi', nome: 'Negozi', icona: iconaNegozi },
        { href: '/caselle', nome: 'Caselle', icona: iconaBusta },
        { href: '/impostazioni', nome: 'Impostazioni', icona: iconaImpostazioni },
      ],
    },
  ]

  return (
    <nav className="sidebar">
      {gruppi.map((g) => (
        <div className="sb-sezione" key={g.titolo}>
          <div className="sb-label">{g.titolo}</div>
          {g.voci.map((v) => {
            const attiva = v.href === '/' ? path === '/' : path.startsWith(v.href)
            return (
              <Link key={v.href} href={v.href} className={`sb-item${attiva ? ' attiva' : ''}`}>
                <span className="sb-icona">{v.icona}</span>
                <span className="sb-nome">{v.nome}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

const T = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
}

const iconaLista = (
  <svg {...T}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </svg>
)
const iconaCalendario = (
  <svg {...T}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
)
const iconaPagamenti = (
  <svg {...T} strokeLinejoin="round">
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M2.5 10h19" />
    <path d="M6 14.5h3" />
  </svg>
)
const iconaClienti = (
  <svg {...T} strokeLinejoin="round">
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
    <circle cx="9.5" cy="7.5" r="3.5" />
    <path d="M21 20v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const iconaChat = (
  <svg {...T} strokeLinejoin="round">
    <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z" />
  </svg>
)
const iconaScript = (
  <svg {...T} strokeLinejoin="round">
    <path d="M5 3.5h10l4 4v13H5z" />
    <path d="M15 3.5v4h4" />
    <path d="M8.5 12h7M8.5 16h4.5" />
  </svg>
)
const iconaNegozi = (
  <svg {...T} strokeLinejoin="round">
    <path d="M4 9h16l-1 11H5z" />
    <path d="M8 9V6.5a4 4 0 0 1 8 0V9" />
  </svg>
)
const iconaBusta = (
  <svg {...T} strokeLinejoin="round">
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
)
const iconaImpostazioni = (
  <svg {...T}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
