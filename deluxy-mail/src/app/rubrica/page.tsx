import Link from 'next/link'
import { db } from '@/lib/db'
import { elencoContatti, iniziali } from '@/lib/contatti'
import { dataBreve } from '@/lib/format'
import { CercaContatti } from '@/components/CercaContatti'
import { BottoneAI } from '@/components/BottoneAI'
import { richiediUtente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ q?: string }> }

export default async function Rubrica({ searchParams }: Props) {
  const { q } = await searchParams
  const u = await richiediUtente()
  const contatti = await elencoContatti(u.id, q)

  // Chi è già stato analizzato: il pulsante lo dice, così non si rispende una
  // chiamata al modello per riavere lo stesso quadro.
  const riassunti = await db.riassuntoContatto.findMany({
    where: { utenteId: u.id, email: { in: contatti.map((c) => c.email) } },
    select: { email: true, aggiornatoIl: true },
  })
  const analizzatoIl = new Map(riassunti.map((r) => [r.email, r.aggiornatoIl]))

  // I più frequenti solo quando non stai cercando: durante una ricerca sono
  // rumore, hai già in mente chi vuoi.
  const frequenti = q ? [] : [...contatti].sort((a, b) => b.messaggi - a.messaggi).slice(0, 8)

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Rubrica</h1>
          <p className="page-caption">
            Chi ti scrive e chi scrivi, registrato da solo dalla posta. Apri un contatto per vedere
            tutti i suoi messaggi.
          </p>
        </div>
      </div>

      <div style={{ margin: '4px 0 20px' }}>
        <CercaContatti valore={q ?? ''} />
      </div>

      {frequenti.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            I più frequenti
          </h2>
          <div className="frequenti-grid">
            {frequenti.map((c) => (
              <div key={c.email} className="frequente-card">
                <Link href={`/rubrica/${encodeURIComponent(c.email)}`} className="frequente">
                  <span className="avatar">{iniziali(c.nome, c.email)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="frequente-nome">{c.nome || c.email.split('@')[0]}</span>
                    <span className="frequente-mail">{c.email}</span>
                    <span className="frequente-conta">
                      {c.messaggi} messaggi
                      {c.daRispondere > 0 && ` · ${c.daRispondere} da rispondere`}
                    </span>
                  </span>
                </Link>
                <div className="frequente-ai">
                  <BottoneAI email={c.email} aggiornatoIl={analizzatoIl.get(c.email) ?? null} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">{q ? 'Risultati' : 'Tutti i contatti'}</h2>
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
                  <th className="num">Situazione</th>
                </tr>
              </thead>
              <tbody>
                {contatti.map((c) => (
                  <tr key={c.email} className="row-link">
                    <td>
                      <Link
                        href={`/rubrica/${encodeURIComponent(c.email)}`}
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
                    <td className="num">
                      <BottoneAI email={c.email} aggiornatoIl={analizzatoIl.get(c.email) ?? null} />
                    </td>
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
