import { db } from '@/lib/db'
import { creaRegola } from '@/lib/actions'
import { AzioniRegola } from '@/components/AzioniRegola'

export const dynamic = 'force-dynamic'

export default async function Regole() {
  const [regole, sezioni] = await Promise.all([
    db.regola.findMany({ orderBy: [{ priorita: 'desc' }, { creataIl: 'asc' }], include: { sezione: true } }),
    db.sezione.findMany({ orderBy: { ordine: 'asc' } }),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Regole</h1>
          <p className="page-caption">
            Come vuoi che AI Mail tratti la posta. Le condizioni esatte decidono da sole; le
            istruzioni scritte in italiano le legge l’AI.
          </p>
        </div>
      </div>

      {regole.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">⚙</div>
            <div className="empty-title">Nessuna regola</div>
            <p className="empty-text">
              Senza regole l’AI smista comunque, basandosi sulla descrizione delle sezioni.
              Le regole servono quando vuoi essere sicuro del risultato.
            </p>
          </div>
        </div>
      ) : (
        regole.map((r) => (
          <div key={r.id} className="rule-card">
            <div className="rule-head">
              <div>
                <div className="rule-name">{r.nome}</div>
                <div className="mail-tags" style={{ marginTop: 6 }}>
                  {r.sezione && (
                    <span className={`badge ${r.sezione.colore}`}>
                      <span className="dot" />
                      in “{r.sezione.nome}”
                    </span>
                  )}
                  {r.creaAttivita && <span className="badge neutral">crea attività</span>}
                  {r.creaBozza && <span className="badge neutral">prepara bozza</span>}
                  {r.segnaLetta && <span className="badge neutral">segna letta</span>}
                  {r.archivia && <span className="badge neutral">archivia</span>}
                  {r.fermaQui && <span className="badge neutral">ferma qui</span>}
                  <span className="badge neutral">priorità {r.priorita}</span>
                </div>
              </div>
              <AzioniRegola id={r.id} attiva={r.attiva} />
            </div>

            <div className="rule-cond">
              {r.seMittente || r.seOggetto || r.seContiene ? (
                <>
                  Quando{' '}
                  {[
                    r.seMittente && (
                      <>
                        il mittente contiene <code>{r.seMittente}</code>
                      </>
                    ),
                    r.seOggetto && (
                      <>
                        l’oggetto contiene <code>{r.seOggetto}</code>
                      </>
                    ),
                    r.seContiene && (
                      <>
                        il testo contiene <code>{r.seContiene}</code>
                      </>
                    ),
                  ]
                    .filter(Boolean)
                    .map((frammento, i, arr) => (
                      <span key={i}>
                        {frammento}
                        {i < arr.length - 1 ? ' e ' : ''}
                      </span>
                    ))}
                </>
              ) : (
                <span className="muted">Istruzione sempre valida (nessuna condizione esatta).</span>
              )}
              {r.istruzioneAI && (
                <div style={{ marginTop: 6 }}>
                  <span className="ai-mark" style={{ color: 'var(--gold-strong)', fontWeight: 600 }}>
                    AI
                  </span>{' '}
                  {r.istruzioneAI}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <h2 className="section-title">Nuova regola</h2>
      <div className="card">
        <form action={creaRegola}>
          <div className="form-grid">
            <div className="full">
              <label className="field-label">
                Nome <span className="req">*</span>
              </label>
              <input type="text" name="nome" required placeholder="Ordini dai fornitori" />
            </div>

            <div>
              <label className="field-label">Se il mittente contiene</label>
              <input type="text" name="seMittente" placeholder="@fornitore.it" />
            </div>
            <div>
              <label className="field-label">Se l’oggetto contiene</label>
              <input type="text" name="seOggetto" placeholder="fattura" />
            </div>
            <div>
              <label className="field-label">Se il testo contiene</label>
              <input type="text" name="seContiene" />
            </div>

            <div className="full">
              <label className="field-label">Istruzione per l’AI (in italiano)</label>
              <textarea
                name="istruzioneAI"
                rows={3}
                placeholder="Se il cliente lamenta un ritardo, priorità alta e bozza di scuse con una data di consegna nuova."
              />
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Se lasci vuote le tre condizioni qui sopra, questa istruzione vale per ogni
                messaggio.
              </div>
            </div>

            <div>
              <label className="field-label">Sposta nella sezione</label>
              <select name="sezioneId" defaultValue="">
                <option value="">— nessuna, decide l’AI —</option>
                {sezioni.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Priorità della regola</label>
              <input type="number" name="priorita" defaultValue={0} />
            </div>

            <div className="full">
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label className="checkbox-row">
                  <input type="checkbox" name="creaAttivita" /> Crea sempre un’attività
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="creaBozza" /> Prepara sempre una bozza
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="segnaLetta" /> Segna già letta
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="archivia" /> Archivia subito
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" name="fermaQui" /> Non valutare altre regole
                </label>
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button className="btn primary" type="submit">
              Crea regola
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
