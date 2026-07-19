import Link from 'next/link'
import { db } from '@/lib/db'
import { CheckAttivita } from '@/components/CheckAttivita'
import { BottoneEsegui } from '@/components/BottoneEsegui'
import { NuovaAttivita } from '@/components/NuovaAttivita'
import { coloreDiPriorita, priorita as livello, FUSO } from '@/lib/format'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

export default async function Attivita() {
  const u = await richiediUtente()
  const [daFare, fatte] = await Promise.all([
    db.attivita.findMany({
      where: { utenteId: u.id, fatta: false },
      orderBy: [{ scadenza: 'asc' }, { creataIl: 'desc' }],
      include: { messaggio: { select: { id: true, oggetto: true, mittente: true } } },
    }),
    db.attivita.findMany({
      where: { utenteId: u.id, fatta: true },
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
            Quello che le mail ti chiedono di fare, più le attività che aggiungi tu.
          </p>
        </div>
      </div>

      <NuovaAttivita />

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
                  {a.messaggio ? (
                    <div className="task-sub">
                      da{' '}
                      <Link href={`/messaggio/${a.messaggio.id}`} style={{ textDecoration: 'underline' }}>
                        {a.messaggio.oggetto}
                      </Link>{' '}
                      · {a.messaggio.mittente}
                    </div>
                  ) : (
                    a.contattoEmail && (
                      <div className="task-sub">
                        dal punto della situazione con{' '}
                        <Link
                          href={`/rubrica/${encodeURIComponent(a.contattoEmail)}`}
                          style={{ textDecoration: 'underline' }}
                        >
                          {a.contattoEmail}
                        </Link>
                      </div>
                    )
                  )}
                </div>
                <div className="task-side">
                  {a.scadenza && (
                    <span className={`badge ${scaduta ? 'red' : 'neutral'}`}>
                      {scaduta ? 'scaduta ' : 'entro '}
                      {a.scadenza.toLocaleDateString('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span
                    className={`badge ${coloreDiPriorita(a.priorita)}`}
                    title={livello(a.priorita)?.quando}
                  >
                    {a.priorita}
                  </span>
                  {/* Esegui solo se c'è una mail a cui rispondere: un'attività
                      scritta a mano senza origine non ha nulla da eseguire. */}
                  {(a.messaggio || a.contattoEmail) && <BottoneEsegui id={a.id} />}
                </div>
              </div>
            )
          })
        )}
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
                      completata il {a.fattaIl.toLocaleDateString('it-IT', { timeZone: FUSO })}
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
