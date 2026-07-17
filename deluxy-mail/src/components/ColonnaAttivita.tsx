import Link from 'next/link'
import { db } from '@/lib/db'
import { CheckAttivita } from './CheckAttivita'
import { coloreDiPriorita, priorita as livello } from '@/lib/format'

/**
 * Le attività aperte, in colonna a destra della posta in arrivo.
 * Solo desktop: sotto i 1100px la colonna sparisce e resta la pagina Attività,
 * perché su uno schermo stretto toglierebbe spazio alla posta.
 */
export async function ColonnaAttivita() {
  const attivita = await db.attivita.findMany({
    where: { fatta: false },
    orderBy: [{ scadenza: 'asc' }, { priorita: 'asc' }],
    take: 15,
    include: { messaggio: { select: { id: true } } },
  })

  const totale = await db.attivita.count({ where: { fatta: false } })

  const oggi = new Date()
  oggi.setHours(23, 59, 59, 999)

  return (
    <aside className="col-attivita">
      <div className="col-attivita-head">
        <span className="nav-label" style={{ padding: 0 }}>
          Da fare
        </span>
        {totale > 0 && <span className="badge neutral">{totale}</span>}
      </div>

      <div className="card tight">
        {attivita.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Niente da fare</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Le attività compaiono qui quando una mail ti chiede qualcosa.
            </p>
          </div>
        ) : (
          attivita.map((a) => {
            const scaduta = a.scadenza && a.scadenza < oggi
            return (
              <div key={a.id} className="col-task">
                <CheckAttivita id={a.id} fatta={a.fatta} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="col-task-titolo">
                    {a.messaggio ? (
                      <Link href={`/messaggio/${a.messaggio.id}`}>{a.titolo}</Link>
                    ) : (
                      a.titolo
                    )}
                  </div>
                  <div className="col-task-meta">
                    <span
                      className={`badge ${coloreDiPriorita(a.priorita)}`}
                      title={livello(a.priorita)?.quando}
                    >
                      {a.priorita}
                    </span>
                    {a.scadenza && (
                      <span className={scaduta ? 'scaduta' : 'muted'}>
                        {scaduta ? 'scaduta ' : 'entro '}
                        {a.scadenza.toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {totale > attivita.length && (
        <Link
          href="/attivita"
          className="btn secondary small"
          style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
        >
          Vedi tutte le {totale}
        </Link>
      )}
    </aside>
  )
}
