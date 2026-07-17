import Link from 'next/link'
import { db } from '@/lib/db'
import { creaAttivitaManuale } from '@/lib/actions'
import { CheckAttivita } from '@/components/CheckAttivita'
import { coloreDiPriorita } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Attivita() {
  const [daFare, fatte] = await Promise.all([
    db.attivita.findMany({
      where: { fatta: false },
      orderBy: [{ scadenza: 'asc' }, { creataIl: 'desc' }],
      include: { messaggio: { select: { id: true, oggetto: true, mittente: true } } },
    }),
    db.attivita.findMany({
      where: { fatta: true },
      orderBy: { fattaIl: 'desc' },
      take: 20,
      include: { messaggio: { select: { id: true, oggetto: true, mittente: true } } },
    }),
  ])

  const oggi = new Date()
  oggi.setHours(23, 59, 59, 999)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Attività</h1>
          <p className="page-caption">
            Quello che le mail ti chiedono di fare, estratto automaticamente dall’AI.
          </p>
        </div>
      </div>

      <div className="card tight">
        {daFare.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✓</div>
            <div className="empty-title">Non hai attività aperte</div>
            <p className="empty-text">
              Quando una mail ti chiede qualcosa, l’attività compare qui da sola.
            </p>
          </div>
        ) : (
          daFare.map((a) => {
            const scaduta = a.scadenza && a.scadenza < oggi
            return (
              <div key={a.id} className="task-row">
                <CheckAttivita id={a.id} fatta={a.fatta} />
                <div style={{ minWidth: 0 }}>
                  <div className="task-titolo">{a.titolo}</div>
                  {a.dettaglio && <div className="task-sub">{a.dettaglio}</div>}
                  {a.messaggio && (
                    <div className="task-sub">
                      da{' '}
                      <Link href={`/messaggio/${a.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                        {a.messaggio.oggetto}
                      </Link>{' '}
                      · {a.messaggio.mittente}
                    </div>
                  )}
                </div>
                <div className="task-side">
                  {a.scadenza && (
                    <span className={`badge ${scaduta ? 'red' : 'neutral'}`}>
                      {scaduta ? 'scaduta ' : 'entro '}
                      {a.scadenza.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span className={`badge ${coloreDiPriorita(a.priorita)}`}>{a.priorita}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <h2 className="section-title">Aggiungi un’attività</h2>
      <div className="card">
        <form action={creaAttivitaManuale}>
          <div className="form-grid">
            <div className="full">
              <label className="field-label">
                Titolo <span className="req">*</span>
              </label>
              <input type="text" name="titolo" required placeholder="Richiamare il fornitore" />
            </div>
            <div className="full">
              <label className="field-label">Dettaglio</label>
              <input type="text" name="dettaglio" />
            </div>
            <div>
              <label className="field-label">Scadenza</label>
              <input type="date" name="scadenza" />
            </div>
            <div>
              <label className="field-label">Priorità</label>
              <select name="priorita" defaultValue="media">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Aggiungi
            </button>
          </div>
        </form>
      </div>

      {fatte.length > 0 && (
        <>
          <h2 className="section-title">Fatte di recente</h2>
          <div className="card tight">
            {fatte.map((a) => (
              <div key={a.id} className="task-row fatta">
                <CheckAttivita id={a.id} fatta={a.fatta} />
                <div>
                  <div className="task-titolo">{a.titolo}</div>
                  {a.fattaIl && (
                    <div className="task-sub">
                      completata il {a.fattaIl.toLocaleDateString('it-IT')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
