import Link from 'next/link'
import { db } from '@/lib/db'
import { SyncButton } from './SyncButton'

type Voce = { href: string; label: string; badge?: number }

async function datiSidebar() {
  // Se il database non è ancora configurato la sidebar non deve far crollare
  // la pagina: mostra le voci fisse e nessuna sezione.
  try {
    const [sezioni, daFare, nonLette, cestinati, bozze] = await Promise.all([
      db.sezione.findMany({
        orderBy: { ordine: 'asc' },
        include: {
          _count: {
            select: {
              messaggi: {
                where: {
                  archiviato: false,
                  letto: false,
                  cestinato: false,
                  direzione: 'entrata',
                },
              },
            },
          },
        },
      }),
      db.attivita.count({ where: { fatta: false } }),
      db.messaggio.count({
        where: { letto: false, archiviato: false, cestinato: false, direzione: 'entrata' },
      }),
      db.messaggio.count({ where: { cestinato: true } }),
      db.bozza.count({ where: { inviata: false } }),
    ])
    return { sezioni, daFare, nonLette, cestinati, bozze, errore: false }
  } catch {
    return { sezioni: [], daFare: 0, nonLette: 0, cestinati: 0, bozze: 0, errore: true }
  }
}

export async function Sidebar() {
  const { sezioni, daFare, nonLette, cestinati, bozze } = await datiSidebar()

  const principali: Voce[] = [
    { href: '/', label: 'Posta in arrivo', badge: nonLette },
    { href: '/attivita', label: 'Attività', badge: daFare },
    { href: '/bozze', label: 'Bozze', badge: bozze },
    { href: '/inviata', label: 'Posta inviata' },
    { href: '/rubrica', label: 'Rubrica' },
    { href: '/cestino', label: 'Cestino', badge: cestinati },
  ]

  const gestione: Voce[] = [
    { href: '/regole', label: 'Regole' },
    { href: '/sezioni', label: 'Sezioni' },
    { href: '/impostazioni', label: 'Impostazioni' },
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">D</div>
        <div>
          <div className="brand-name">AI Mail</div>
          <div className="brand-sub">Deluxy · 2.0</div>
        </div>
      </div>

      <SyncButton />

      <nav className="nav-section">
        <div className="nav-label">Posta</div>
        {principali.map((v) => (
          <Link key={v.href} href={v.href} className="nav-item">
            <span style={{ flex: 1 }}>{v.label}</span>
            {v.badge ? <span className="badge neutral">{v.badge}</span> : null}
          </Link>
        ))}
      </nav>

      {sezioni.length > 0 && (
        <nav className="nav-section">
          <div className="nav-label">Sezioni</div>
          {sezioni.map((s) => (
            <Link key={s.id} href={`/?sezione=${s.id}`} className="nav-item">
              <span className="badge-dot-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span
                  className="dot"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: `var(--${s.colore})`,
                    flex: '0 0 7px',
                  }}
                />
                {s.nome}
              </span>
              {s._count.messaggi ? <span className="badge neutral">{s._count.messaggi}</span> : null}
            </Link>
          ))}
        </nav>
      )}

      <nav className="nav-section">
        <div className="nav-label">Gestione</div>
        {gestione.map((v) => (
          <Link key={v.href} href={v.href} className="nav-item">
            <span style={{ flex: 1 }}>{v.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
