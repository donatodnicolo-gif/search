import Link from 'next/link'
import { elencoContatti, iniziali } from '@/lib/contatti'
import { dataBreve } from '@/lib/format'
import { CercaContatti } from '@/components/CercaContatti'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string }> }

export default async function Contatti({ searchParams }: Props) {
  const { q } = await searchParams
  const contatti = await elencoContatti(q)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contatti</h1>
          <p className="page-caption">
            Chi ti scrive, registrato da solo dalla posta. Apri un contatto per vedere tutti i
            suoi messaggi.
          </p>
        </div>
        <div className="page-actions">
          <CercaContatti valore={q ?? ''} />
        </div>
      </div>

      <div className="card tight">
        {contatti.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">☺</div>
            <div className="empty-title">{q ? 'Nessun contatto trovato' : 'Nessun contatto'}</div>
            <p className="empty-text">
              {q
                ? `Nessuno corrisponde a “${q}”. Prova con una parte del nome o dell’indirizzo.`
                : 'I contatti compaiono qui man mano che scarichi la posta.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contatto</th>
                  <th className="num">Messaggi</th>
                  <th className="num">Da rispondere</th>
                  <th className="num">Ultimo</th>
                </tr>
              </thead>
              <tbody>
                {contatti.map((c) => (
                  <tr key={c.email} className="row-link">
                    <td>
                      <Link
                        href={`/contatti/${encodeURIComponent(c.email)}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <span className="avatar">{iniziali(c.nome, c.email)}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 500 }}>
                            {c.nome || c.email.split('@')[0]}
                          </span>
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            {c.email}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="num">{c.messaggi}</td>
                    <td className="num">
                      {c.daRispondere > 0 ? (
                        <span className="badge orange">{c.daRispondere}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num muted">{dataBreve(c.ultimo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
