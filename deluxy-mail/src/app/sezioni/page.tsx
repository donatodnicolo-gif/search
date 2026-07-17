import { db } from '@/lib/db'
import { creaSezione } from '@/lib/actions'
import { EliminaSezione } from '@/components/EliminaSezione'

export const dynamic = 'force-dynamic'

const COLORI = ['blue', 'green', 'orange', 'red', 'purple', 'gold'] as const

export default async function Sezioni() {
  const sezioni = await db.sezione.findMany({
    orderBy: { ordine: 'asc' },
    include: { _count: { select: { messaggi: true } } },
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sezioni</h1>
          <p className="page-caption">
            Le colonne in cui l’AI allinea la posta. Conta la descrizione, non il nome: è
            quella che il modello legge per decidere.
          </p>
        </div>
      </div>

      <div className="card tight">
        {sezioni.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◫</div>
            <div className="empty-title">Nessuna sezione</div>
            <p className="empty-text">
              Crea le tue: Ordini, Fornitori, Amministrazione, Clienti… L’AI ci smisterà la
              posta da sola.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sezione</th>
                  <th>Cosa ci va (lo legge l’AI)</th>
                  <th className="num">Messaggi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sezioni.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className={`badge ${s.colore}`}>
                        <span className="dot" />
                        {s.nome}
                      </span>
                    </td>
                    <td className="muted">{s.descrizione}</td>
                    <td className="num">{s._count.messaggi}</td>
                    <td className="num">
                      <EliminaSezione id={s.id} nome={s.nome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="section-title">Nuova sezione</h2>
      <div className="card">
        <form action={creaSezione}>
          <div className="form-grid">
            <div>
              <label className="field-label">
                Nome <span className="req">*</span>
              </label>
              <input type="text" name="nome" required placeholder="Ordini" />
            </div>
            <div>
              <label className="field-label">Colore</label>
              <select name="colore" defaultValue="blue">
                {COLORI.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="full">
              <label className="field-label">
                Cosa ci va <span className="req">*</span>
              </label>
              <textarea
                name="descrizione"
                rows={2}
                required
                placeholder="Mail di clienti che ordinano fiori o composizioni, conferme d’ordine, modifiche e disdette."
              />
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Crea sezione
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
