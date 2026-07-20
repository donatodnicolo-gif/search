import { db } from '@/lib/db'
import { richiediAdmin } from '@/lib/sessione'
import { iniziali } from '@/lib/contatti'
import { FormUtente } from '@/components/FormUtente'
import { AzioniUtente } from '@/components/AzioniUtente'

export const dynamic = 'force-dynamic'

export default async function Utenti() {
  const admin = await richiediAdmin()
  const utenti = await db.utente.findMany({
    orderBy: { creatoIl: 'asc' },
    include: { _count: { select: { account: true, messaggi: true } } },
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Utenti</h1>
          <p className="page-caption">
            Chi può accedere ad AI Mail. Ogni utente vede solo la propria posta.
          </p>
        </div>
      </div>

      <div className="card tight">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Utente</th>
                <th>Ruolo</th>
                <th className="num">Caselle</th>
                <th className="num">Messaggi</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {utenti.map((utente) => (
                <tr key={utente.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="avatar">{iniziali(utente.nome, utente.email)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 500 }}>{utente.nome}</span>
                        <span className="muted" style={{ fontSize: 12.5 }}>{utente.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${utente.ruolo === 'admin' ? 'gold' : 'neutral'}`}>
                      {utente.ruolo === 'admin' ? 'Amministratore' : 'Utente'}
                    </span>
                  </td>
                  <td className="num">{utente._count.account}</td>
                  <td className="num">{utente._count.messaggi}</td>
                  <td>
                    {utente.attivo ? (
                      <span className="badge green"><span className="dot" />attivo</span>
                    ) : (
                      <span className="badge neutral"><span className="dot" />sospeso</span>
                    )}
                  </td>
                  <td className="num">
                    {utente.id === admin.id ? (
                      <span className="muted" style={{ fontSize: 12 }}>tu</span>
                    ) : (
                      <AzioniUtente id={utente.id} nome={utente.nome} attivo={utente.attivo} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">Nuovo utente</h2>
      <div className="card">
        <FormUtente />
      </div>
    </>
  )
}
