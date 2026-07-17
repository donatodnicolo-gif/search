import { db } from '@/lib/db'
import { salvaImpostazioni } from '@/lib/actions'
import { leggiImpostazioni, CHIAVI } from '@/lib/impostazioni'
import { FormAccount } from '@/components/FormAccount'
import { EliminaAccount } from '@/components/EliminaAccount'
import { ScaricaStorico } from '@/components/ScaricaStorico'
import { dataLunga } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Impostazioni() {
  const [account, impostazioni] = await Promise.all([
    db.account.findMany({
      orderBy: { creatoIl: 'asc' },
      include: { _count: { select: { messaggi: true } } },
    }),
    leggiImpostazioni(),
  ])

  const aiPronta = Boolean(process.env.OPENAI_API_KEY)
  const modello = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-caption">Caselle collegate e contesto che l’AI usa per rispondere.</p>
        </div>
      </div>

      <h2 className="section-title">Caselle collegate</h2>
      <div className="card tight">
        {account.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✉</div>
            <div className="empty-title">Nessuna casella</div>
            <p className="empty-text">Collega la prima casella con il modulo qui sotto.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Casella</th>
                  <th>Server IMAP</th>
                  <th>Ultima lettura</th>
                  <th>Stato</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {account.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.nome}</strong>
                      <div className="muted">{a.email}</div>
                    </td>
                    <td className="muted">
                      {a.imapHost}:{a.imapPort} · {a.cartella}
                    </td>
                    <td className="muted">
                      {a.ultimoSync ? dataLunga(a.ultimoSync) : 'mai'}
                    </td>
                    <td>
                      {a.ultimoErrore ? (
                        <span className="badge red" title={a.ultimoErrore}>
                          <span className="dot" />
                          errore
                        </span>
                      ) : (
                        <span className="badge green">
                          <span className="dot" />
                          ok
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <EliminaAccount id={a.id} email={a.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {account.length > 0 && (
        <>
          <h2 className="section-title">Scaricare la posta vecchia</h2>
          <div className="card">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Al primo collegamento AI Mail prende solo la posta recente, per non tirare giù
              anni di archivio senza che tu l’abbia chiesto. Il resto della casella è ancora
              sul server: da qui lo recuperi un blocco alla volta.
            </p>
            {account.map((a) => (
              <div key={a.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  {a.nome} · <span className="muted">{a._count.messaggi} messaggi scaricati</span>
                </div>
                <ScaricaStorico
                  accountId={a.id}
                  storicoFinito={a.storicoFinito}
                  messaggiInArchivio={a._count.messaggi}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Collega una casella</h2>
      <div className="card">
        <FormAccount />
      </div>

      <h2 className="section-title">Intelligenza artificiale</h2>
      <div className="card">
        <div className="mail-tags" style={{ marginBottom: 16 }}>
          {aiPronta ? (
            <span className="badge green">
              <span className="dot" />
              Chiave OpenAI configurata · modello {modello}
            </span>
          ) : (
            <span className="badge orange">
              <span className="dot" />
              OPENAI_API_KEY mancante: l’analisi automatica è spenta
            </span>
          )}
        </div>

        <form action={salvaImpostazioni}>
          <div className="form-grid">
            <div className="full">
              <label className="field-label">Contesto aziendale</label>
              <textarea
                name="contestoAzienda"
                rows={4}
                defaultValue={impostazioni[CHIAVI.contestoAzienda] ?? ''}
                placeholder="Deluxy consegna fiori e composizioni a Milano. Lavoriamo con fiorai e pasticcerie partner. Le consegne si prenotano entro le 18 del giorno prima."
              />
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                L’AI legge questo testo prima di ogni risposta: più è preciso, meno correzioni
                dovrai fare.
              </div>
            </div>
            <div className="full">
              <label className="field-label">Firma per le bozze</label>
              <textarea
                name="firma"
                rows={3}
                defaultValue={impostazioni[CHIAVI.firma] ?? ''}
                placeholder={'Nicolò Donato\nDeluxy\n+39 ...'}
              />
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Salva
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
