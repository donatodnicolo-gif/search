import Link from 'next/link'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { esci } from '@/lib/auth-actions'
import { iniziali } from '@/lib/contatti'
import { SyncButton } from './SyncButton'

type Voce = { href: string; label: string; badge?: number }

async function datiSidebar(utenteId: string) {
  try {
    const [sezioni, daFare, nonLette, cestinati, bozze] = await Promise.all([
      db.sezione.findMany({
        where: { utenteId },
        orderBy: { ordine: 'asc' },
        include: {
          _count: {
            select: {
              messaggi: {
                where: { archiviato: false, letto: false, cestinato: false, direzione: 'entrata' },
              },
            },
          },
        },
      }),
      db.attivita.count({ where: { utenteId, fatta: false } }),
      db.messaggio.count({
        where: {
          utenteId,
          letto: false,
          archiviato: false,
          cestinato: false,
          direzione: 'entrata',
          // La posta indesiderata non gonfia il contatore della posta in arrivo.
          NOT: { sezione: { nome: 'SPAM' } },
        },
      }),
      db.messaggio.count({ where: { utenteId, cestinato: true } }),
      db.bozza.count({ where: { utenteId, inviata: false } }),
    ])
    return { sezioni, daFare, nonLette, cestinati, bozze }
  } catch {
    return { sezioni: [], daFare: 0, nonLette: 0, cestinati: 0, bozze: 0 }
  }
}

export async function Sidebar() {
  const utente = await utenteCorrente()
  if (!utente) return null // la pagina reindirizza al login; niente sidebar

  const { sezioni, daFare, nonLette, cestinati, bozze } = await datiSidebar(utente.id)

  const principali: Voce[] = [
    { href: '/', label: 'Posta in arrivo', badge: nonLette },
    { href: '/attivita', label: 'Attività', badge: daFare },
    { href: '/calendario', label: 'Calendario' },
    { href: '/bozze', label: 'Bozze', badge: bozze },
    { href: '/inviata', label: 'Posta inviata' },
    { href: '/rubrica', label: 'Rubrica' },
    { href: '/cestino', label: 'Cestino', badge: cestinati },
  ]

  const gestione: Voce[] = [
    { href: '/regole', label: 'Regole' },
    { href: '/sezioni', label: 'Sezioni' },
    { href: '/impostazioni', label: 'Impostazioni' },
    ...(utente.ruolo === 'admin' ? [{ href: '/utenti', label: 'Utenti' }] : []),
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span
                  className="dot"
                  style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--${s.colore})`, flex: '0 0 7px' }}
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

      <div className="sidebar-footer">
        <span className="avatar">{iniziali(utente.nome, utente.email)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {utente.nome}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {utente.ruolo === 'admin' ? 'Amministratore' : 'Utente'}
          </div>
        </div>
        <form action={esci}>
          <button
            type="submit"
            title="Esci"
            style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
          >
            Esci
          </button>
        </form>
      </div>
    </aside>
  )
}
