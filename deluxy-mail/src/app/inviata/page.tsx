import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

export default async function PostaInviata() {
  const u = await richiediUtente()
  const messaggi = await db.messaggio.findMany({
    where: { utenteId: u.id, direzione: 'uscita', cestinato: false },
    orderBy: { data: 'desc' },
    take: 200,
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Posta inviata</h1>
          <p className="page-caption">
            Le mail spedite da AI Mail. Ne resta una copia anche nella cartella “Inviata” della
            casella, così le rivedi da qualsiasi altro client.
          </p>
        </div>
      </div>

      <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">↗</div>
            <div className="empty-title">Non hai ancora inviato niente</div>
            <p className="empty-text">
              Qui compaiono le risposte e gli inoltri che parti da AI Mail. Quello che hai
              mandato da altri programmi resta nella tua casella, non qui.
            </p>
          </div>
        ) : (
          <div className="mail-list">
            {messaggi.map((m) => (
              <div key={m.id} className="mail-row">
                <div className="mail-row-head">
                  <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                    <div className="mail-top">
                      <span className="dot-spacer" />
                      <span className="mail-mittente">a {m.destinatari}</span>
                    </div>
                    <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                      {m.oggetto}
                    </div>
                    <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                      <span className="muted">{m.anteprima}</span>
                    </div>
                  </Link>
                  <div className="mail-row-side">
                    <span className="mail-data">{dataBreve(m.data)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
