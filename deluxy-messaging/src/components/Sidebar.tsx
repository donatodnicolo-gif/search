'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Menu laterale (stesso impianto di Deluxy Orders). È un client component per
// evidenziare la voce attiva e per richiudersi da solo su mobile.
export function Sidebar() {
  const path = usePathname()

  // Su mobile il menu è un pannello che copre la pagina: appena hai scelto dove
  // andare deve togliersi di mezzo. Chiuderlo al cambio di PERCORSO — e non nel
  // click del link — copre anche le navigazioni che partono da altrove (tasto
  // indietro, redirect dopo un'azione): il pannello non resta mai davanti a una
  // pagina che non c'entra più.
  useEffect(() => {
    document.documentElement.removeAttribute('data-menu-aperto')
  }, [path])

  const gruppi = [
    {
      titolo: 'Customer Service',
      voci: [
        { href: '/reclami', nome: 'Reclami', icona: iconaReclamo },
        { href: '/reclami/casistiche', nome: 'Casistiche', icona: iconaCasistiche },
        { href: '/rimborsi', nome: 'Rimborsi', icona: iconaRimborso },
        { href: '/reclami/punteggi', nome: 'Punteggi', icona: iconaPunteggi },
        { href: '/reclami/feedback', nome: 'Feedback e orari', icona: iconaFeedback },
        { href: '/reclami/giudizi', nome: 'Giudizi', icona: iconaGiudizi },
        { href: '/reclami/valet', nome: 'Valet', icona: iconaValet },
      ],
    },
    {
      titolo: 'Ordini',
      voci: [
        { href: '/', nome: 'Ordini aperti', icona: iconaLista },
        { href: '/ordini-globali', nome: 'Ordini globali', icona: iconaArchivio },
        { href: '/calendario', nome: 'Calendario', icona: iconaCalendario },
        { href: '/clienti', nome: 'Clienti', icona: iconaClienti },
        { href: '/partner', nome: 'Partner', icona: iconaPartner },
        { href: '/pagamenti', nome: 'Pagamenti', icona: iconaPagamenti },
      ],
    },
    {
      titolo: 'Messaggi',
      voci: [
        { href: '/inbox', nome: 'Inbox', icona: iconaChat },
        { href: '/script', nome: 'Script', icona: iconaScript },
        { href: '/cs-ai', nome: 'CS AI', icona: iconaCsAi },
      ],
    },
    {
      titolo: 'Configurazione',
      voci: [
        { href: '/utenti', nome: 'Utenti', icona: iconaUtenti },
        { href: '/negozi', nome: 'Negozi', icona: iconaNegozi },
        { href: '/numeri-whatsapp', nome: 'Numeri WhatsApp', icona: iconaChat },
        { href: '/account-meta', nome: 'Facebook e Instagram', icona: iconaChat },
        { href: '/aspetto-widget', nome: 'Widget dei siti', icona: iconaChat },
        { href: '/caselle', nome: 'Caselle', icona: iconaBusta },
        { href: '/impostazioni', nome: 'Impostazioni', icona: iconaImpostazioni },
      ],
    },
  ]

  // La voce attiva è quella il cui href è il prefisso PIÙ LUNGO del percorso:
  // così su /reclami/casistiche si accende "Casistiche", non "Reclami".
  const tutteLeVoci = gruppi.flatMap((g) => g.voci)
  const combacia = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(href + '/')
  const hrefAttivo = tutteLeVoci
    .filter((v) => combacia(v.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    // L'id serve al bottone del menu (aria-controls): chi usa un lettore di
    // schermo deve poter sapere che cosa apre quel tasto.
    <nav className="sidebar" id="menu-laterale">
      {gruppi.map((g) => (
        <div className="sb-sezione" key={g.titolo}>
          <div className="sb-label">{g.titolo}</div>
          {g.voci.map((v) => {
            const attiva = v.href === hrefAttivo
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

const iconaArchivio = (
  <svg {...T}>
    <rect x="3" y="4" width="18" height="5" rx="1.5" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </svg>
);
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
const iconaPartner = (
  <svg {...T} strokeLinejoin="round">
    <path d="M3 20V9l6-4 6 4v11" />
    <path d="M15 20V12h6v8" />
    <path d="M7 13h4M7 16.5h4M18 15.5v1" />
  </svg>
)
const iconaChat = (
  <svg {...T} strokeLinejoin="round">
    <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.8-5.2a8 8 0 0 1-.8-3.5A8.4 8.4 0 0 1 12.5 4 8.4 8.4 0 0 1 21 11.5z" />
  </svg>
)
const iconaCsAi = (
  // Una scintilla dentro un fumetto: l'AI che parla ai clienti.
  <svg {...T} strokeLinejoin="round">
    <path d="M20.5 11.5a7.9 7.9 0 0 1-8 7.8 8.4 8.4 0 0 1-3-.6L3.5 20.5l1.7-4.9a7.6 7.6 0 0 1-.7-3.3 7.9 7.9 0 0 1 8-7.8" />
    <path d="M17.5 2.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
  </svg>
)
const iconaScript = (
  <svg {...T} strokeLinejoin="round">
    <path d="M5 3.5h10l4 4v13H5z" />
    <path d="M15 3.5v4h4" />
    <path d="M8.5 12h7M8.5 16h4.5" />
  </svg>
)
const iconaUtenti = (
  // Due persone: gli account di chi entra nell'app.
  <svg {...T} strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.1" />
    <path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19v1" />
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
const iconaReclamo = (
  <svg {...T} strokeLinejoin="round">
    <path d="M10.3 3.9 2.6 17.5A1.7 1.7 0 0 0 4 20h16a1.7 1.7 0 0 0 1.4-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0z" />
    <line x1="12" y1="9" x2="12" y2="13.5" />
    <circle cx="12" cy="16.7" r="0.6" fill="currentColor" />
  </svg>
)
const iconaCasistiche = (
  <svg {...T} strokeLinejoin="round">
    <path d="M4 6h4v4H4zM4 14h4v4H4z" />
    <line x1="11" y1="8" x2="20" y2="8" />
    <line x1="11" y1="16" x2="20" y2="16" />
  </svg>
)
const iconaRimborso = (
  // Banconota che torna indietro: soldi che rientrano al cliente.
  <svg {...T} strokeLinejoin="round">
    <rect x="2.5" y="7" width="19" height="11" rx="2" />
    <circle cx="12" cy="12.5" r="2.4" />
    <path d="M9 3.5 6.2 6.3 9 9.1" />
  </svg>
)
const iconaPunteggi = (
  <svg {...T} strokeLinejoin="round">
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="5.5" y="12" width="3.5" height="6" />
    <rect x="10.5" y="8" width="3.5" height="10" />
    <rect x="15.5" y="4.5" width="3.5" height="13.5" />
  </svg>
)
const iconaFeedback = (
  <svg {...T} strokeLinejoin="round">
    <path d="M20 13.5a7.6 7.6 0 0 1-7.7 7.5 8 8 0 0 1-2.9-.5L4 22l1.6-4.7A7.3 7.3 0 0 1 4.9 14a7.6 7.6 0 0 1 7.6-7.5" />
    <path d="M17 2.5l1.3 2.7 3 .45-2.15 2.1.5 3L17 9.4l-2.65 1.35.5-3L12.7 5.65l3-.45z" />
  </svg>
)
const iconaGiudizi = (
  <svg {...T} strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z" />
  </svg>
)
const iconaValet = (
  <svg {...T} strokeLinejoin="round">
    <circle cx="12" cy="6" r="2.6" />
    <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
  </svg>
)
const iconaImpostazioni = (
  <svg {...T}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)
