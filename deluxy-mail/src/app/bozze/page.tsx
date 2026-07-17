import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Bozze() {
  const bozze = await db.bozza.findMany({
    where: { inviata: false },
    orderBy: { creataIl: 'desc' },
    include: { messaggio: { select: { id: true, mittente: true, mittenteNome: true, data: true } } },
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Bozze</h1>
          <p className="page-caption">
            Le risposte già scritte dall’AI, in attesa che tu le controlli. Nessuna parte da sola.
          </p>
        </div>
      </div>

      <div className="card tight">
        {bozze.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✎</div>
            <div className="empty-title">Nessuna bozza in attesa</div>
            <p className="empty-text">
              Quando arriva una mail che chiede una risposta, la bozza compare qui.
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {bozze.map((b) => (
              <Link key={b.id} href={`/messaggio/${b.messaggio.id}`} className="mail-row">
                <div className="mail-top">
                  <span className="dot-spacer" />
                  <span className="mail-mittente">
                    a {b.messaggio.mittenteNome || b.messaggio.mittente}
                  </span>
                  <span className="mail-data">{dataBreve(b.messaggio.data)}</span>
                </div>
                <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                  {b.oggetto}
                </div>
                <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                  <span className="muted">{b.corpo.replace(/\s+/g, ' ').slice(0, 160)}…</span>
                </div>
                {b.modificata && (
                  <div className="mail-tags" style={{ paddingLeft: 17 }}>
                    <span className="badge neutral">modificata da te</span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
