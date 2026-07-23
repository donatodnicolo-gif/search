import Link from 'next/link'
import { db } from '@/lib/db'
import { dataBreve } from '@/lib/format'
import { AzioniRiga } from '@/components/AzioniRiga'
import { SvuotaCestino } from '@/components/SvuotaCestino'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

export default async function Cestino() {
  const u = await richiediUtente()
  const messaggi = await db.messaggio.findMany({
    where: { utenteId: u.id, cestinato: true },
    orderBy: { cestinatoIl: 'desc' },
    take: 200,
    // La lista mostra solo riassunto/anteprima: i corpi non servono e pesano.
    omit: { corpoTesto: true, corpoHtml: true },
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cestino</h1>
          <p className="page-caption">
            Messaggi tolti da AI Mail. Sulla casella sono ancora lì: qui sparisce solo la copia
            che l’app usa per lavorare.
          </p>
        </div>
        {messaggi.length > 0 && (
          <div className="page-actions">
            <SvuotaCestino quanti={messaggi.length} />
          </div>
        )}
      </div>

      <div className="card tight">
        {messaggi.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗑</div>
            <div className="empty-title">Cestino vuoto</div>
            <p className="empty-text">Niente da buttare, per ora.</p>
          </div>
        ) : (
          <div className="mail-list">
            {messaggi.map((m) => (
              <div key={m.id} className="mail-row">
                <Link href={`/messaggio/${m.id}`} className="mail-row-link">
                  <div className="mail-top">
                    <span className="dot-spacer" />
                    <span className="mail-mittente">{m.mittenteNome || m.mittente}</span>
                    <span className="mail-data">
                      {m.cestinatoIl ? `cestinato ${dataBreve(m.cestinatoIl)}` : ''}
                    </span>
                  </div>
                  <div className="mail-oggetto" style={{ paddingLeft: 17 }}>
                    {m.oggetto}
                  </div>
                  <div className="mail-riassunto" style={{ paddingLeft: 17 }}>
                    <span className="muted">{m.riassunto || m.anteprima}</span>
                  </div>
                </Link>
                <div className="riga-azioni" style={{ paddingLeft: 17 }}>
                  <AzioniRiga id={m.id} archiviato={m.archiviato} cestinato={m.cestinato} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
